import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { LANGUAGES, MAX_SOURCE_BYTES, type LanguageId } from "@sfera/shared";
import { problemFileSchema } from "../../seed/problem-files.js";
import { seedProblem } from "../../seed/problems.js";
import {
  InvalidArchiveError,
  parseTestCaseArchive,
} from "./testcase-archive.js";
import {
  deleteProblem,
  findProblemForAdmin,
  insertProblem,
  listAllProblems,
  replaceTestCases,
  updateProblem,
} from "./problems.repository.js";
import {
  NoTestCasesError,
  ProblemNotFoundError,
  ReferenceSolutionFailedError,
  publishProblem,
  runReferenceSolution,
  unpublishProblem,
} from "./problems.service.js";

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
  statement: z.string().min(1),
  timeLimit: z.number().positive().max(60).default(2),
  memoryLimit: z.number().int().positive().max(1_048_576).default(128000),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  statement: z.string().min(1).optional(),
  timeLimit: z.number().positive().max(60).optional(),
  memoryLimit: z.number().int().positive().max(1_048_576).optional(),
});

const testCasesSchema = z.object({
  testCases: z
    .array(
      z.object({
        input: z.string(),
        expectedOutput: z.string(),
        isSample: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(500),
});

const solutionSchema = z.object({
  language: z.enum(languageIds),
  source: z
    .string()
    .min(1)
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= MAX_SOURCE_BYTES,
      `The code exceeds ${MAX_SOURCE_BYTES} bytes`,
    ),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const requireAdmin = app.requireRole("ADMIN");

  app.get(
    "/api/admin/problems",
    { preHandler: requireAdmin },
    async () => listAllProblems(app.db),
  );

  app.get<{ Params: { slug: string } }>("/api/admin/problems/:slug", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const problem = await findProblemForAdmin(app.db, request.params.slug);
      if (!problem) {
        return reply.code(404).send({ error: "No such problem" });
      }
      return problem;
    },
  });

  app.post("/api/admin/problems", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const existing = await findProblemForAdmin(app.db, parsed.data.slug);
      if (existing) {
        return reply.code(409).send({ error: "That slug is taken" });
      }

      // A new problem always starts as a draft — publishing needs a reference solution.
      const problem = await insertProblem(app.db, {
        ...parsed.data,
        createdBy: request.currentUser!.id,
      });
      return reply.code(201).send(problem);
    },
  });

  app.patch<{ Params: { slug: string } }>("/api/admin/problems/:slug", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const problem = await updateProblem(
        app.db,
        request.params.slug,
        parsed.data,
      );
      if (!problem) {
        return reply.code(404).send({ error: "No such problem" });
      }
      return problem;
    },
  });

  app.put<{ Params: { slug: string } }>("/api/admin/problems/:slug/test-cases", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const parsed = testCasesSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const problem = await findProblemForAdmin(app.db, request.params.slug);
      if (!problem) {
        return reply.code(404).send({ error: "No such problem" });
      }

      await replaceTestCases(app.db, problem.id, parsed.data.testCases);
      return { testCaseCount: parsed.data.testCases.length };
    },
  });

  app.post<{ Params: { slug: string } }>("/api/admin/problems/:slug/validate", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const parsed = solutionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        return await runReferenceSolution(app.db, app.judge0, request.params.slug, {
          language: parsed.data.language as LanguageId,
          source: parsed.data.source,
        });
      } catch (error) {
        return handleProblemError(error, reply);
      }
    },
  });

  app.post<{ Params: { slug: string } }>("/api/admin/problems/:slug/publish", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const parsed = solutionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        const run = await publishProblem(app.db, app.judge0, request.params.slug, {
          language: parsed.data.language as LanguageId,
          source: parsed.data.source,
        });
        return { published: true, ...run };
      } catch (error) {
        if (error instanceof ReferenceSolutionFailedError) {
          // 422: the request is valid, but the problem is not fit to publish.
          return reply
            .code(422)
            .send({ error: error.message, published: false, ...error.run });
        }
        return handleProblemError(error, reply);
      }
    },
  });

  app.post<{ Params: { slug: string } }>("/api/admin/problems/:slug/unpublish", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      try {
        await unpublishProblem(app.db, request.params.slug);
        return { published: false };
      } catch (error) {
        return handleProblemError(error, reply);
      }
    },
  });

  app.get<{ Params: { slug: string } }>("/api/admin/problems/:slug/export", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const problem = await findProblemForAdmin(app.db, request.params.slug);
      if (!problem) {
        return reply.code(404).send({ error: "No such problem" });
      }

      // Format zgodny z data/problems/*.json — to samo, co przyjmuje seed.
      return reply
        .header(
          "Content-Disposition",
          `attachment; filename="${problem.slug}.json"`,
        )
        .send({
          slug: problem.slug,
          title: problem.title,
          statement: problem.statement,
          timeLimit: problem.timeLimit,
          memoryLimit: problem.memoryLimit,
          testCases: problem.testCases.map((testCase) => ({
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            isSample: testCase.isSample,
          })),
        });
    },
  });

  app.post("/api/admin/problems/import", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const parsed = problemFileSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const existing = await findProblemForAdmin(app.db, parsed.data.slug);
      const report = await seedProblem(app.db, parsed.data);

      // Importing does not publish — a freshly uploaded problem still has to
      // pass reference validation. `seedProblem` sets isPublic, so we undo it.
      if (!existing?.isPublic) {
        await unpublishProblem(app.db, parsed.data.slug);
      }

      return reply.code(existing ? 200 : 201).send(report);
    },
  });

  app.post<{ Params: { slug: string }; Querystring: { sampleCount?: string } }>(
    "/api/admin/problems/:slug/test-cases/archive",
    {
      preHandler: requireAdmin,
      handler: async (request, reply) => {
        const problem = await findProblemForAdmin(app.db, request.params.slug);
        if (!problem) {
          return reply.code(404).send({ error: "No such problem" });
        }

        const upload = await request.file();
        if (!upload) {
          return reply.code(400).send({ error: "No file in the request" });
        }

        const sampleCount = Number.parseInt(
          request.query.sampleCount ?? "",
          10,
        );

        try {
          const cases = parseTestCaseArchive(await upload.toBuffer(), {
            sampleCount: Number.isFinite(sampleCount) ? sampleCount : undefined,
          });
          await replaceTestCases(app.db, problem.id, cases);
          return { testCaseCount: cases.length };
        } catch (error) {
          if (error instanceof InvalidArchiveError) {
            return reply.code(400).send({ error: error.message });
          }
          throw error;
        }
      },
    },
  );

  app.delete<{ Params: { slug: string } }>("/api/admin/problems/:slug", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const removed = await deleteProblem(app.db, request.params.slug);
      if (!removed) {
        return reply.code(404).send({ error: "No such problem" });
      }
      return reply.code(204).send();
    },
  });
}

function handleProblemError(error: unknown, reply: FastifyReply): unknown {
  if (error instanceof ProblemNotFoundError) {
    return reply.code(404).send({ error: error.message });
  }
  if (error instanceof NoTestCasesError) {
    return reply.code(400).send({ error: error.message });
  }
  throw error;
}
