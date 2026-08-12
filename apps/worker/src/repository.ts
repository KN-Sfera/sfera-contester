import { asc, eq } from "drizzle-orm";
import {
  problems,
  submissionResults,
  submissions,
  testCases,
  type Database,
} from "@sfera/db";
import type { LanguageId, Verdict } from "@sfera/shared";

export interface JudgeTask {
  submissionId: string;
  language: LanguageId;
  source: string;
  timeLimit: number;
  memoryLimit: number;
  tests: {
    id: string;
    ordinal: number;
    input: string;
    expectedOutput: string;
  }[];
}

export async function loadJudgeTask(
  db: Database,
  submissionId: string,
): Promise<JudgeTask | null> {
  const [row] = await db
    .select({
      id: submissions.id,
      language: submissions.language,
      source: submissions.source,
      problemId: submissions.problemId,
      timeLimit: problems.timeLimit,
      memoryLimit: problems.memoryLimit,
    })
    .from(submissions)
    .innerJoin(problems, eq(problems.id, submissions.problemId))
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!row) return null;

  const tests = await db
    .select({
      id: testCases.id,
      ordinal: testCases.ordinal,
      input: testCases.input,
      expectedOutput: testCases.expectedOutput,
    })
    .from(testCases)
    .where(eq(testCases.problemId, row.problemId))
    .orderBy(asc(testCases.ordinal));

  return {
    submissionId: row.id,
    language: row.language as LanguageId,
    source: row.source,
    timeLimit: row.timeLimit,
    memoryLimit: row.memoryLimit,
    tests,
  };
}

export async function markRunning(
  db: Database,
  submissionId: string,
): Promise<void> {
  await db
    .update(submissions)
    .set({ status: "RUNNING" })
    .where(eq(submissions.id, submissionId));
}

export interface TestOutcome {
  testCaseId: string;
  ordinal: number;
  verdict: Exclude<Verdict, "OK">;
  time: number | null;
  memory: number | null;
  stderr: string;
  compileOutput: string;
}

export interface FinishInput {
  submissionId: string;
  verdict: Exclude<Verdict, "OK">;
  failedTestOrdinal: number | null;
  maxTime: number | null;
  maxMemory: number | null;
  outcomes: TestOutcome[];
}

/**
 * Wyniki i werdykt lądują w jednej transakcji — nigdy nie chcemy stanu, w którym
 * submit jest DONE, ale wyniki per test tylko częściowo zapisane.
 */
export async function finishSubmission(
  db: Database,
  input: FinishInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Ponowne ocenianie tego samego submitu nadpisuje poprzedni przebieg.
    await tx
      .delete(submissionResults)
      .where(eq(submissionResults.submissionId, input.submissionId));

    if (input.outcomes.length > 0) {
      await tx.insert(submissionResults).values(
        input.outcomes.map((outcome) => ({
          submissionId: input.submissionId,
          testCaseId: outcome.testCaseId,
          ordinal: outcome.ordinal,
          verdict: outcome.verdict,
          time: outcome.time,
          memory: outcome.memory,
          stderr: outcome.stderr,
          compileOutput: outcome.compileOutput,
        })),
      );
    }

    await tx
      .update(submissions)
      .set({
        status: "DONE",
        verdict: input.verdict,
        failedTestOrdinal: input.failedTestOrdinal,
        maxTime: input.maxTime,
        maxMemory: input.maxMemory,
        judgedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(submissions.id, input.submissionId));
  });
}

export async function failSubmission(
  db: Database,
  submissionId: string,
  message: string,
): Promise<void> {
  await db
    .update(submissions)
    .set({
      status: "FAILED",
      errorMessage: message.slice(0, 2000),
      judgedAt: new Date(),
    })
    .where(eq(submissions.id, submissionId));
}
