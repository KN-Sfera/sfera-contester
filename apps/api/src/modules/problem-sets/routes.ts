import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  DuplicateProblemError,
  UnknownProblemError,
  deleteProblemSet,
  findProblemSetBySlug,
  findPublicProblemSet,
  insertProblemSet,
  listAllProblemSets,
  listPublicProblemSets,
  setProblemSetItems,
  updateProblemSet,
} from "./repository.js";

const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "slug: tylko małe litery, cyfry i myślniki");

const createSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(""),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  isPublic: z.boolean().optional(),
});

const itemsSchema = z.object({
  problemSlugs: z.array(slugSchema).max(500),
});

export async function problemSetRoutes(app: FastifyInstance): Promise<void> {
  // --- Publiczne ---

  app.get("/api/problem-sets", async (request) => {
    // Postęp liczymy tylko dla zalogowanych, ale sama lista jest otwarta.
    const userId = await optionalUserId(request);
    return listPublicProblemSets(app.db, userId);
  });

  app.get<{ Params: { slug: string } }>(
    "/api/problem-sets/:slug",
    async (request, reply) => {
      const userId = await optionalUserId(request);
      const set = await findPublicProblemSet(
        app.db,
        request.params.slug,
        userId,
      );
      if (!set) {
        return reply.code(404).send({ error: "Nie ma takiego zestawu" });
      }
      return set;
    },
  );

  // --- Admin ---

  const requireAdmin = app.requireRole("ADMIN");

  app.get(
    "/api/admin/problem-sets",
    { preHandler: requireAdmin },
    async () => listAllProblemSets(app.db),
  );

  app.post("/api/admin/problem-sets", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const existing = await findProblemSetBySlug(app.db, parsed.data.slug);
      if (existing) {
        return reply.code(409).send({ error: "Slug jest już zajęty" });
      }

      const set = await insertProblemSet(app.db, {
        ...parsed.data,
        createdBy: request.currentUser!.id,
      });
      return reply.code(201).send(set);
    },
  });

  app.patch<{ Params: { slug: string } }>("/api/admin/problem-sets/:slug", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const set = await updateProblemSet(
        app.db,
        request.params.slug,
        parsed.data,
      );
      if (!set) {
        return reply.code(404).send({ error: "Nie ma takiego zestawu" });
      }
      return set;
    },
  });

  app.put<{ Params: { slug: string } }>("/api/admin/problem-sets/:slug/items", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const parsed = itemsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const set = await findProblemSetBySlug(app.db, request.params.slug);
      if (!set) {
        return reply.code(404).send({ error: "Nie ma takiego zestawu" });
      }

      try {
        await setProblemSetItems(app.db, set.id, parsed.data.problemSlugs);
        return { problemCount: parsed.data.problemSlugs.length };
      } catch (error) {
        return handleItemsError(error, reply);
      }
    },
  });

  app.delete<{ Params: { slug: string } }>("/api/admin/problem-sets/:slug", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const removed = await deleteProblemSet(app.db, request.params.slug);
      if (!removed) {
        return reply.code(404).send({ error: "Nie ma takiego zestawu" });
      }
      return reply.code(204).send();
    },
  });
}

/** Zwraca id zalogowanego albo null — nie odrzuca anonimowych. */
async function optionalUserId(request: {
  jwtVerify: () => Promise<{ sub: string }>;
}): Promise<string | null> {
  try {
    const claims = await request.jwtVerify();
    return claims.sub;
  } catch {
    return null;
  }
}

function handleItemsError(error: unknown, reply: FastifyReply): unknown {
  if (
    error instanceof UnknownProblemError ||
    error instanceof DuplicateProblemError
  ) {
    return reply.code(400).send({ error: error.message, slugs: error.slugs });
  }
  throw error;
}
