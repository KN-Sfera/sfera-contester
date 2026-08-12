import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LANGUAGES, type LanguageId } from "@sfera/shared";
import { listLanguages } from "@sfera/judge0";
import { ProblemNotFoundError, runOnce, runSamples } from "./service.js";

const languageIds = LANGUAGES.map((language) => language.id) as [
  string,
  ...string[],
];

const runSchema = z.object({
  language: z.enum(languageIds),
  source: z.string().min(1),
  stdin: z.string().optional(),
  expectedStdout: z.string().optional(),
  cpuTimeLimit: z.number().min(0.1).max(10).optional(),
  memoryLimit: z.number().min(1000).max(256000).optional(),
});

const runSamplesSchema = z.object({
  language: z.enum(languageIds),
  source: z.string().min(1),
  problemSlug: z.string().min(1),
});

export async function runRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/languages", async () => listLanguages());

  app.post("/api/run", {
    config: {
      rateLimit: { max: 10, timeWindow: "1 minute" },
    },
    handler: async (request, reply) => {
      const parsed = runSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        return await runOnce(app.judge0, {
          ...parsed.data,
          language: parsed.data.language as LanguageId,
        });
      } catch (error) {
        request.log.error(error);
        return reply.code(502).send({
          error: error instanceof Error ? error.message : "Judge failed",
        });
      }
    },
  });

  app.post("/api/run-samples", {
    config: {
      rateLimit: { max: 6, timeWindow: "1 minute" },
    },
    handler: async (request, reply) => {
      const parsed = runSamplesSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        return await runSamples(app.db, app.judge0, {
          ...parsed.data,
          language: parsed.data.language as LanguageId,
        });
      } catch (error) {
        if (error instanceof ProblemNotFoundError) {
          return reply.code(404).send({ error: "Problem or samples not found" });
        }
        request.log.error(error);
        return reply.code(502).send({
          error: error instanceof Error ? error.message : "Judge failed",
        });
      }
    },
  });
}
