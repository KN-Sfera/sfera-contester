import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import {
  problems,
  testCases,
  type Database,
  type ProblemRow,
} from "@sfera/db";

export interface AdminProblemSummary {
  id: string;
  slug: string;
  title: string;
  timeLimit: number;
  memoryLimit: number;
  isPublic: boolean;
  testCaseCount: number;
  sampleCount: number;
  updatedAt: Date;
}

/** Widok admina — pokazuje też szkice, w przeciwieństwie do listy publicznej. */
export async function listAllProblems(
  db: Database,
): Promise<AdminProblemSummary[]> {
  const rows = await db
    .select({
      id: problems.id,
      slug: problems.slug,
      title: problems.title,
      timeLimit: problems.timeLimit,
      memoryLimit: problems.memoryLimit,
      isPublic: problems.isPublic,
      updatedAt: problems.updatedAt,
      testCaseCount: sql<number>`count(${testCases.id})::int`,
      sampleCount: sql<number>`count(${testCases.id}) filter (where ${testCases.isSample})::int`,
    })
    .from(problems)
    .leftJoin(testCases, eq(testCases.problemId, problems.id))
    .groupBy(problems.id)
    .orderBy(desc(problems.updatedAt));

  return rows;
}

export interface AdminProblemDetail extends ProblemRow {
  testCases: {
    id: string;
    ordinal: number;
    input: string;
    expectedOutput: string;
    isSample: boolean;
  }[];
}

/** Admin widzi pełną treść testów — to jedyne miejsce, gdzie ukryte wychodzą na zewnątrz. */
export async function findProblemForAdmin(
  db: Database,
  slug: string,
): Promise<AdminProblemDetail | null> {
  const [problem] = await db
    .select()
    .from(problems)
    .where(eq(problems.slug, slug))
    .limit(1);

  if (!problem) return null;

  const cases = await db
    .select({
      id: testCases.id,
      ordinal: testCases.ordinal,
      input: testCases.input,
      expectedOutput: testCases.expectedOutput,
      isSample: testCases.isSample,
    })
    .from(testCases)
    .where(eq(testCases.problemId, problem.id))
    .orderBy(asc(testCases.ordinal));

  return { ...problem, testCases: cases };
}

export interface CreateProblemInput {
  slug: string;
  title: string;
  statement: string;
  timeLimit: number;
  memoryLimit: number;
  createdBy: string;
}

export async function insertProblem(
  db: Database,
  input: CreateProblemInput,
): Promise<ProblemRow> {
  const [problem] = await db
    .insert(problems)
    .values({ ...input, isPublic: false })
    .returning();
  return problem!;
}

export interface UpdateProblemInput {
  title?: string;
  statement?: string;
  timeLimit?: number;
  memoryLimit?: number;
}

export async function updateProblem(
  db: Database,
  slug: string,
  input: UpdateProblemInput,
): Promise<ProblemRow | null> {
  const [problem] = await db
    .update(problems)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(problems.slug, slug))
    .returning();
  return problem ?? null;
}

export async function setProblemPublished(
  db: Database,
  slug: string,
  isPublic: boolean,
): Promise<ProblemRow | null> {
  const [problem] = await db
    .update(problems)
    .set({ isPublic, updatedAt: new Date() })
    .where(eq(problems.slug, slug))
    .returning();
  return problem ?? null;
}

export async function deleteProblem(
  db: Database,
  slug: string,
): Promise<boolean> {
  const deleted = await db
    .delete(problems)
    .where(eq(problems.slug, slug))
    .returning({ id: problems.id });
  return deleted.length > 0;
}

export interface TestCaseInput {
  input: string;
  expectedOutput: string;
  isSample: boolean;
}

/**
 * Podmienia komplet testów zadania. Numeracja idzie od 1 wg kolejności w tablicy.
 *
 * Aktualizuje po `ordinal` zamiast kasować i wstawiać od nowa — inaczej
 * `submission_results.test_case_id` traciłby powiązanie przy każdej edycji
 * i historia submitów przestawałaby wskazywać, który test poległ.
 */
export async function replaceTestCases(
  db: Database,
  problemId: string,
  cases: TestCaseInput[],
): Promise<void> {
  await db.transaction(async (tx) => {
    if (cases.length > 0) {
      await tx
        .insert(testCases)
        .values(
          cases.map((testCase, index) => ({
            problemId,
            ordinal: index + 1,
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            isSample: testCase.isSample,
          })),
        )
        .onConflictDoUpdate({
          target: [testCases.problemId, testCases.ordinal],
          set: {
            input: sql`excluded.input`,
            expectedOutput: sql`excluded.expected_output`,
            isSample: sql`excluded.is_sample`,
          },
        });
    }

    await tx
      .delete(testCases)
      .where(
        and(
          eq(testCases.problemId, problemId),
          gt(testCases.ordinal, cases.length),
        ),
      );

    await tx
      .update(problems)
      .set({ updatedAt: new Date() })
      .where(eq(problems.id, problemId));
  });
}
