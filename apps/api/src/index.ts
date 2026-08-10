import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import {
  LANGUAGES,
  type RunSamplesResult,
  type SampleRunCaseResult,
  type Verdict,
} from "@sfera/shared";
import { executeCode, listLanguages, waitForJudge0 } from "./judge0.js";
import { getProblem, getSampleCases, listProblems } from "./problems.js";

const languageIds = LANGUAGES.map((l) => l.id) as [string, ...string[]];

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

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
  });

  await app.register(rateLimit, {
    max: 30,
    timeWindow: "1 minute",
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/languages", async () => listLanguages());

  app.get("/api/problems", async () => listProblems());

  app.get<{ Params: { slug: string } }>(
    "/api/problems/:slug",
    async (request, reply) => {
      const problem = getProblem(request.params.slug);
      if (!problem) {
        return reply.code(404).send({ error: "Problem not found" });
      }
      return {
        slug: problem.slug,
        title: problem.title,
        statement: problem.statement,
        timeLimit: problem.timeLimit,
        memoryLimit: problem.memoryLimit,
        testCases: problem.testCases.filter((tc) => tc.isSample),
      };
    },
  );

  app.post("/api/run", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "1 minute",
      },
    },
    handler: async (request, reply) => {
      const parsed = runSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        const result = await executeCode({
          ...parsed.data,
          language: parsed.data.language as (typeof LANGUAGES)[number]["id"],
        });
        return result;
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
      rateLimit: {
        max: 6,
        timeWindow: "1 minute",
      },
    },
    handler: async (request, reply) => {
      const parsed = runSamplesSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const loaded = getSampleCases(parsed.data.problemSlug);
      if (!loaded || loaded.samples.length === 0) {
        return reply.code(404).send({ error: "Problem or samples not found" });
      }

      const results: SampleRunCaseResult[] = [];
      let overall: Verdict = "ACC";

      try {
        for (const testCase of loaded.samples) {
          const result = await executeCode({
            language: parsed.data
              .language as (typeof LANGUAGES)[number]["id"],
            source: parsed.data.source,
            stdin: testCase.input,
            expectedStdout: testCase.expectedOutput,
            cpuTimeLimit: loaded.problem.timeLimit,
            memoryLimit: loaded.problem.memoryLimit,
          });

          results.push({
            testCaseId: testCase.id,
            verdict: result.verdict,
            status: result.status,
            stdout: result.stdout,
            stderr: result.stderr,
            compileOutput: result.compileOutput,
            time: result.time,
            memory: result.memory,
          });

          if (result.verdict !== "ACC") {
            overall = result.verdict === "OK" ? "WA" : result.verdict;
            break;
          }
        }

        const payload: RunSamplesResult = {
          problemSlug: parsed.data.problemSlug,
          verdict: overall,
          results,
        };
        return payload;
      } catch (error) {
        request.log.error(error);
        return reply.code(502).send({
          error: error instanceof Error ? error.message : "Judge failed",
        });
      }
    },
  });

  await app.listen({ port: PORT, host: HOST });

  waitForJudge0()
    .then(() => app.log.info("Judge0 is ready"))
    .catch((error) => {
      app.log.warn(
        { err: error },
        "Judge0 not ready yet — /api/run may fail until Judge0 boots",
      );
    });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
