import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LANGUAGES, MAX_SOURCE_BYTES, type LanguageId } from "@sfera/shared";
import {
  findUserSubmission,
  listUserSubmissions,
} from "./repository.js";
import { openSseStream } from "../../sse.js";
import { ProblemNotAvailableError, submit } from "./service.js";

const languageIds = LANGUAGES.map((language) => language.id) as [
  string,
  ...string[],
];

const submitSchema = z.object({
  problemSlug: z.string().min(1).max(64),
  language: z.enum(languageIds),
  source: z
    .string()
    .min(1)
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= MAX_SOURCE_BYTES,
      `The code exceeds ${MAX_SOURCE_BYTES} bytes`,
    ),
});

export async function submissionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/submissions", {
    preHandler: app.requireAuth,
    config: {
      rateLimit: { max: 20, timeWindow: "1 minute" },
    },
    handler: async (request, reply) => {
      const parsed = submitSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        const result = await submit(app.db, app.judgeQueue, {
          userId: request.currentUser!.id,
          problemSlug: parsed.data.problemSlug,
          language: parsed.data.language as LanguageId,
          source: parsed.data.source,
        });
        // 202: accepted for judging, the result comes later.
        return reply.code(202).send(result);
      } catch (error) {
        if (error instanceof ProblemNotAvailableError) {
          return reply.code(404).send({ error: "No such problem" });
        }
        throw error;
      }
    },
  });

  app.get(
    "/api/submissions",
    { preHandler: app.requireAuth },
    async (request) => listUserSubmissions(app.db, request.currentUser!.id),
  );

  app.get<{ Params: { id: string } }>("/api/submissions/:id", {
    preHandler: app.requireAuth,
    handler: async (request, reply) => {
      const submission = await findUserSubmission(
        app.db,
        request.params.id,
        request.currentUser!.id,
      );

      // Someone else's submission and a missing one both return 404 —
      // otherwise the endpoint would let anyone probe which ids exist.
      if (!submission) {
        return reply.code(404).send({ error: "No such submission" });
      }
      return submission;
    },
  });

  app.get<{ Params: { id: string } }>("/api/submissions/:id/events", {
    preHandler: app.requireAuth,
    handler: async (request, reply) => {
      const submissionId = request.params.id;
      const userId = request.currentUser!.id;

      const owned = await findUserSubmission(app.db, submissionId, userId);
      if (!owned) {
        return reply.code(404).send({ error: "No such submission" });
      }

      // We subscribe BEFORE reading the status. The other order would lose
      // events fired in the window between the check and the subscription.
      let unsubscribe = async (): Promise<void> => {};
      const stream = openSseStream(reply, () => {
        void unsubscribe();
      });

      unsubscribe = await app.progressBus.subscribe(submissionId, (event) => {
        stream.sendNamed(event.type, event);
        if (event.type === "done" || event.type === "failed") {
          stream.close();
        }
      });

      // The submission may have been judged before the client connected —
      // then no event will ever arrive and the stream would hang forever.
      const current = await findUserSubmission(app.db, submissionId, userId);
      if (current?.status === "DONE" && current.verdict) {
        stream.sendNamed("done", {
          type: "done",
          submissionId,
          verdict: current.verdict,
          failedTestOrdinal: current.failedTestOrdinal,
        });
        stream.close();
      } else if (current?.status === "FAILED") {
        stream.sendNamed("failed", {
          type: "failed",
          submissionId,
          message: "Judging failed",
        });
        stream.close();
      }

      return reply;
    },
  });
}
