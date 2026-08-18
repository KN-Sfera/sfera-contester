import { and, asc, eq } from "drizzle-orm";
import { problems, testCases, type Database } from "@sfera/db";
import type { Problem, ProblemSummary } from "@sfera/shared";

/**
 * Raw access to problems — hidden tests included. The HTTP layer never reaches
 * in here directly; the only way out is the projection in `service.ts`.
 */

export async function listPublicProblems(
  db: Database,
): Promise<ProblemSummary[]> {
  const rows = await db
    .select({
      slug: problems.slug,
      title: problems.title,
      statement: problems.statement,
      timeLimit: problems.timeLimit,
      memoryLimit: problems.memoryLimit,
      isSample: testCases.isSample,
    })
    .from(problems)
    .leftJoin(testCases, eq(testCases.problemId, problems.id))
    .where(eq(problems.isPublic, true))
    .orderBy(asc(problems.slug));

  const summaries = new Map<string, ProblemSummary>();
  for (const row of rows) {
    const existing = summaries.get(row.slug);
    if (existing) {
      if (row.isSample) existing.sampleCount += 1;
      continue;
    }
    summaries.set(row.slug, {
      slug: row.slug,
      title: row.title,
      statement: row.statement,
      timeLimit: row.timeLimit,
      memoryLimit: row.memoryLimit,
      sampleCount: row.isSample ? 1 : 0,
    });
  }

  return [...summaries.values()];
}

/**
 * Published problems only. Admin access to drafts arrives in Phase 2 with the
 * panel — until then there is no path by which they could be viewed.
 */
export async function findPublicProblemBySlug(
  db: Database,
  slug: string,
): Promise<Problem | null> {
  const [problem] = await db
    .select()
    .from(problems)
    .where(and(eq(problems.slug, slug), eq(problems.isPublic, true)))
    .limit(1);

  if (!problem) return null;

  const cases = await db
    .select()
    .from(testCases)
    .where(eq(testCases.problemId, problem.id))
    .orderBy(asc(testCases.ordinal));

  return {
    slug: problem.slug,
    title: problem.title,
    statement: problem.statement,
    timeLimit: problem.timeLimit,
    memoryLimit: problem.memoryLimit,
    testCases: cases.map((testCase) => ({
      id: testCase.id,
      ordinal: testCase.ordinal,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      isSample: testCase.isSample,
    })),
  };
}
