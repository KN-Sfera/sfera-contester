import { and, eq, gt, sql } from "drizzle-orm";
import { problems, testCases, type Database } from "@sfera/db";
import type { ProblemFile } from "./problem-files.js";

export interface SeedReport {
  slug: string;
  created: boolean;
  testCaseCount: number;
}

/**
 * Wrzuca zadanie do bazy. Idempotentne — powtórne wywołanie z tym samym plikiem
 * nic nie zmienia.
 *
 * Testy są aktualizowane po numerze (`ordinal`), a nie kasowane i wstawiane od
 * nowa. Dzięki temu `submission_results.test_case_id` nie traci powiązania przy
 * każdym seedzie, a historia submitów zostaje spójna.
 */
export async function seedProblem(
  db: Database,
  file: ProblemFile,
): Promise<SeedReport> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: problems.id })
      .from(problems)
      .where(eq(problems.slug, file.slug))
      .limit(1);

    const [problem] = await tx
      .insert(problems)
      .values({
        slug: file.slug,
        title: file.title,
        statement: file.statement,
        timeLimit: file.timeLimit,
        memoryLimit: file.memoryLimit,
        // Zadania z data/problems to publiczny zestaw startowy.
        isPublic: true,
      })
      .onConflictDoUpdate({
        target: problems.slug,
        set: {
          title: file.title,
          statement: file.statement,
          timeLimit: file.timeLimit,
          memoryLimit: file.memoryLimit,
          isPublic: true,
          updatedAt: new Date(),
        },
      })
      .returning({ id: problems.id });

    const problemId = problem!.id;

    await tx
      .insert(testCases)
      .values(
        file.testCases.map((testCase, index) => ({
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

    // Testy, które zniknęły z pliku.
    await tx
      .delete(testCases)
      .where(
        and(
          eq(testCases.problemId, problemId),
          gt(testCases.ordinal, file.testCases.length),
        ),
      );

    return {
      slug: file.slug,
      created: existing.length === 0,
      testCaseCount: file.testCases.length,
    };
  });
}

export async function seedProblems(
  db: Database,
  files: ProblemFile[],
): Promise<SeedReport[]> {
  const reports: SeedReport[] = [];
  for (const file of files) {
    reports.push(await seedProblem(db, file));
  }
  return reports;
}
