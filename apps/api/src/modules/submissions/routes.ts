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
      `Kod przekracza ${MAX_SOURCE_BYTES} bajtów`,
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
        // 202: przyjęte do oceniania, wynik przyjdzie później.
        return reply.code(202).send(result);
      } catch (error) {
        if (error instanceof ProblemNotAvailableError) {
          return reply.code(404).send({ error: "Zadanie nie istnieje" });
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

      // Cudzy submit i nieistniejący submit dają to samo 404 — inaczej endpoint
      // pozwalałby sprawdzać, czy dany identyfikator istnieje.
      if (!submission) {
        return reply.code(404).send({ error: "Nie ma takiego submitu" });
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
        return reply.code(404).send({ error: "Nie ma takiego submitu" });
      }

      // Subskrybujemy PRZED odczytem statusu. Odwrotna kolejność gubiłaby
      // zdarzenia, które padły w oknie między sprawdzeniem a subskrypcją.
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

      // Submit mógł zostać oceniony, zanim klient się podłączył — wtedy nie
      // przyjdzie już żadne zdarzenie i strumień wisiałby w nieskończoność.
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
          message: "Ocenianie nie powiodło się",
        });
        stream.close();
      }

      return reply;
    },
  });
}
