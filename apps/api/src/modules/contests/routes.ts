import { eq } from "drizzle-orm";
import { contests, type ContestRow } from "@sfera/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { LANGUAGES, MAX_SOURCE_BYTES, type LanguageId } from "@sfera/shared";
import {
  UnknownProblemError,
  answerClarification,
  findContestBySlug,
  insertClarification,
  listClarifications,
  listContests,
  listParticipants,
  registerParticipant,
  removeParticipant,
  setContestProblems,
} from "./repository.js";
import { openSseStream } from "../../sse.js";
import { LeaderboardBroadcaster } from "./live.js";
import {
  ContestNotRunningError,
  NotRegisteredError,
  ProblemNotInContestError,
  getContestOverview,
  getContestProblems,
  getLeaderboard,
  leaderboardToCsv,
  submitToContest,
} from "./service.js";

const languageIds = LANGUAGES.map((language) => language.id) as [
  string,
  ...string[],
];

const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "slug: lowercase letters, digits and hyphens only");

const createSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).default(""),
  startsAt: z.coerce.date(),
  durationMinutes: z.number().int().positive().max(7 * 24 * 60),
  penaltyMinutes: z.number().int().min(0).max(1440).default(20),
  freezeMinutes: z.number().int().min(0).max(1440).default(60),
  compileErrorCountsAsAttempt: z.boolean().default(false),
  visibility: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
  registrationOpen: z.boolean().default(false),
});

const updateSchema = createSchema.partial().omit({ slug: true }).extend({
  unfrozen: z.boolean().optional(),
});

const submitSchema = z.object({
  letter: z.string().min(1).max(2),
  language: z.enum(languageIds),
  source: z
    .string()
    .min(1)
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= MAX_SOURCE_BYTES,
      `The code exceeds ${MAX_SOURCE_BYTES} bytes`,
    ),
});

export async function contestRoutes(app: FastifyInstance): Promise<void> {
  const requireAdmin = app.requireRole("ADMIN");

  async function loadContest(
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply,
  ): Promise<ContestRow | null> {
    const contest = await findContestBySlug(app.db, request.params.slug);
    if (!contest) {
      await reply.code(404).send({ error: "No such contest" });
      return null;
    }
    return contest;
  }

  // --- Publiczne ---

  app.get("/api/contests", async (request) => {
    const isAdmin = (await currentRole(request)) === "ADMIN";
    return listContests(app.db, { includePrivate: isAdmin });
  });

  app.get<{ Params: { slug: string } }>(
    "/api/contests/:slug",
    async (request, reply) => {
      const contest = await loadContest(request, reply);
      if (!contest) return reply;

      const isAdmin = (await currentRole(request)) === "ADMIN";
      if (contest.visibility === "PRIVATE" && !isAdmin) {
        return reply.code(404).send({ error: "No such contest" });
      }

      const userId = await currentUserId(request);
      const [overview, problems] = await Promise.all([
        getContestOverview(app.db, contest, { userId }),
        getContestProblems(app.db, contest, { isAdmin }),
      ]);

      return { ...overview, problems };
    },
  );

  app.post<{ Params: { slug: string } }>("/api/contests/:slug/register", {
    preHandler: app.requireAuth,
    handler: async (request, reply) => {
      const contest = await loadContest(request, reply);
      if (!contest) return reply;

      if (!contest.registrationOpen) {
        return reply
          .code(403)
          .send({ error: "Registration for this contest is closed" });
      }

      await registerParticipant(app.db, {
        contestId: contest.id,
        userId: request.currentUser!.id,
        displayName: request.currentUser!.displayName,
        isOfficial: true,
      });
      return { registered: true };
    },
  });

  app.post<{ Params: { slug: string } }>("/api/contests/:slug/submissions", {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (request, reply) => {
      const contest = await loadContest(request, reply);
      if (!contest) return reply;

      const parsed = submitSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        const result = await submitToContest(app.db, app.judgeQueue, contest, {
          userId: request.currentUser!.id,
          letter: parsed.data.letter,
          language: parsed.data.language as LanguageId,
          source: parsed.data.source,
        });
        return reply.code(202).send(result);
      } catch (error) {
        if (error instanceof NotRegisteredError) {
          return reply.code(403).send({ error: error.message });
        }
        if (error instanceof ContestNotRunningError) {
          // 409: a valid request, but the contest is in no state to accept it.
          return reply
            .code(409)
            .send({ error: error.message, phase: error.phase });
        }
        if (error instanceof ProblemNotInContestError) {
          return reply.code(404).send({ error: error.message });
        }
        throw error;
      }
    },
  });

  app.get<{ Params: { slug: string } }>(
    "/api/contests/:slug/leaderboard",
    async (request, reply) => {
      const contest = await loadContest(request, reply);
      if (!contest) return reply;

      const isAdmin = (await currentRole(request)) === "ADMIN";
      return getLeaderboard(app.db, contest, { isAdmin });
    },
  );

  const broadcaster = new LeaderboardBroadcaster(app.db);
  app.addHook("onClose", async () => broadcaster.close());

  app.get<{ Params: { slug: string } }>(
    "/api/contests/:slug/leaderboard/events",
    async (request, reply) => {
      const contest = await loadContest(request, reply);
      if (!contest) return reply;

      const isAdmin = (await currentRole(request)) === "ADMIN";

      let unsubscribe: () => void = () => {};
      const stream = openSseStream(reply, () => unsubscribe());

      unsubscribe = broadcaster.subscribe(contest, { isAdmin }, (view) => {
        stream.sendNamed("leaderboard", view);
      });

      // The first state immediately — a client should not wait out a cycle.
      stream.sendNamed(
        "leaderboard",
        await broadcaster.push(contest, { isAdmin }),
      );

      return reply;
    },
  );

  app.get<{ Params: { slug: string } }>(
    "/api/contests/:slug/clarifications",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const contest = await loadContest(request, reply);
      if (!contest) return reply;

      const userId = request.currentUser!.id;
      const isAdmin = request.currentUser!.role === "ADMIN";
      const all = await listClarifications(app.db, contest.id);

      if (isAdmin) return all;

      // A contestant sees announcements, public answers and their own questions.
      return all.filter(
        (item) =>
          item.askedBy === null || item.isPublic || item.askedBy === userId,
      );
    },
  );

  app.post<{ Params: { slug: string } }>("/api/contests/:slug/clarifications", {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    handler: async (request, reply) => {
      const contest = await loadContest(request, reply);
      if (!contest) return reply;

      const parsed = z
        .object({
          question: z.string().trim().min(3).max(2000),
          problemLetter: z.string().max(2).optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const problems = await getContestProblems(app.db, contest, {
        isAdmin: false,
      });
      const problemId = parsed.data.problemLetter
        ? (problems.find(
            (problem) =>
              problem.letter === parsed.data.problemLetter!.toUpperCase(),
          )?.problemId ?? null)
        : null;

      const created = await insertClarification(app.db, {
        contestId: contest.id,
        problemId,
        askedBy: request.currentUser!.id,
        question: parsed.data.question,
      });
      return reply.code(201).send(created);
    },
  });

  // --- Admin ---

  app.post("/api/admin/contests", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const existing = await findContestBySlug(app.db, parsed.data.slug);
      if (existing) {
        return reply.code(409).send({ error: "That slug is taken" });
      }

      const [contest] = await app.db
        .insert(contests)
        .values({ ...parsed.data, createdBy: request.currentUser!.id })
        .returning();
      return reply.code(201).send(contest);
    },
  });

  app.patch<{ Params: { slug: string } }>("/api/admin/contests/:slug", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const [contest] = await app.db
        .update(contests)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(contests.slug, request.params.slug))
        .returning();

      if (!contest) {
        return reply.code(404).send({ error: "No such contest" });
      }
      return contest;
    },
  });

  app.put<{ Params: { slug: string } }>("/api/admin/contests/:slug/problems", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const contest = await loadContest(request, reply);
      if (!contest) return reply;

      const parsed = z
        .object({ problemSlugs: z.array(slugSchema).max(52) })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        await setContestProblems(app.db, contest.id, parsed.data.problemSlugs);
        return getContestProblems(app.db, contest, { isAdmin: true });
      } catch (error) {
        if (error instanceof UnknownProblemError) {
          return reply.code(400).send({ error: error.message, slugs: error.slugs });
        }
        throw error;
      }
    },
  });

  app.get<{ Params: { slug: string } }>("/api/admin/contests/:slug/participants", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const contest = await loadContest(request, reply);
      if (!contest) return reply;
      return listParticipants(app.db, contest.id);
    },
  });

  app.post<{ Params: { slug: string } }>("/api/admin/contests/:slug/participants", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const contest = await loadContest(request, reply);
      if (!contest) return reply;

      const parsed = z
        .object({
          email: z.string().email(),
          isOfficial: z.boolean().default(true),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const { findUserByEmail } = await import("../auth/repository.js");
      const user = await findUserByEmail(app.db, parsed.data.email);
      if (!user) {
        return reply.code(404).send({ error: "No user with that email" });
      }

      await registerParticipant(app.db, {
        contestId: contest.id,
        userId: user.id,
        displayName: user.displayName,
        isOfficial: parsed.data.isOfficial,
      });
      return reply.code(201).send({ registered: true });
    },
  });

  app.delete<{ Params: { slug: string; userId: string } }>(
    "/api/admin/contests/:slug/participants/:userId",
    {
      preHandler: requireAdmin,
      handler: async (request, reply) => {
        const contest = await loadContest(request, reply);
        if (!contest) return reply;

        const removed = await removeParticipant(
          app.db,
          contest.id,
          request.params.userId,
        );
        if (!removed) {
          return reply.code(404).send({ error: "No such contestant" });
        }
        return reply.code(204).send();
      },
    },
  );

  app.get<{ Params: { slug: string } }>("/api/admin/contests/:slug/leaderboard.csv", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const contest = await loadContest(request, reply);
      if (!contest) return reply;

      const view = await getLeaderboard(app.db, contest, { isAdmin: true });
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="${contest.slug}-wyniki.csv"`,
        )
        .send(leaderboardToCsv(view));
    },
  });

  app.post<{ Params: { slug: string } }>("/api/admin/contests/:slug/announcements", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const contest = await loadContest(request, reply);
      if (!contest) return reply;

      const parsed = z
        .object({ message: z.string().trim().min(1).max(2000) })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      // An announcement is a clarification with no asker, public from the start.
      const created = await insertClarification(app.db, {
        contestId: contest.id,
        problemId: null,
        askedBy: null,
        question: parsed.data.message,
        isPublic: true,
      });
      return reply.code(201).send(created);
    },
  });

  app.post<{ Params: { slug: string; id: string } }>(
    "/api/admin/contests/:slug/clarifications/:id/answer",
    {
      preHandler: requireAdmin,
      handler: async (request, reply) => {
        const parsed = z
          .object({
            answer: z.string().trim().min(1).max(2000),
            isPublic: z.boolean().default(false),
          })
          .safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: parsed.error.flatten() });
        }

        const updated = await answerClarification(
          app.db,
          request.params.id,
          parsed.data,
        );
        if (!updated) {
          return reply.code(404).send({ error: "Nie ma takiego pytania" });
        }
        return updated;
      },
    },
  );
}

async function currentUserId(request: {
  jwtVerify: () => Promise<{ sub: string }>;
}): Promise<string | null> {
  try {
    return (await request.jwtVerify()).sub;
  } catch {
    return null;
  }
}

async function currentRole(request: {
  jwtVerify: () => Promise<{ role: "USER" | "ADMIN" }>;
}): Promise<"USER" | "ADMIN" | null> {
  try {
    return (await request.jwtVerify()).role;
  } catch {
    return null;
  }
}
