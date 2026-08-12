import { and, asc, desc, eq } from "drizzle-orm";
import {
  problems,
  submissionResults,
  submissions,
  type Database,
} from "@sfera/db";
import type { LanguageId, Verdict } from "@sfera/shared";

export interface SubmissionSummary {
  id: string;
  problemSlug: string;
  problemTitle: string;
  language: LanguageId;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  verdict: Verdict | null;
  failedTestOrdinal: number | null;
  maxTime: number | null;
  maxMemory: number | null;
  createdAt: Date;
  judgedAt: Date | null;
}

export interface SubmissionDetail extends SubmissionSummary {
  source: string;
  results: {
    ordinal: number;
    verdict: Verdict;
    time: number | null;
    memory: number | null;
  }[];
}

const summaryColumns = {
  id: submissions.id,
  problemSlug: problems.slug,
  problemTitle: problems.title,
  language: submissions.language,
  status: submissions.status,
  verdict: submissions.verdict,
  failedTestOrdinal: submissions.failedTestOrdinal,
  maxTime: submissions.maxTime,
  maxMemory: submissions.maxMemory,
  createdAt: submissions.createdAt,
  judgedAt: submissions.judgedAt,
};

export async function createSubmission(
  db: Database,
  input: {
    userId: string;
    problemId: string;
    /** NULL dla submitów ćwiczeniowych. */
    contestId?: string;
    language: LanguageId;
    source: string;
  },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(submissions)
    .values({
      userId: input.userId,
      problemId: input.problemId,
      contestId: input.contestId ?? null,
      language: input.language,
      source: input.source,
    })
    .returning({ id: submissions.id });
  return row!;
}

export async function listUserSubmissions(
  db: Database,
  userId: string,
  limit = 50,
): Promise<SubmissionSummary[]> {
  const rows = await db
    .select(summaryColumns)
    .from(submissions)
    .innerJoin(problems, eq(problems.id, submissions.problemId))
    .where(eq(submissions.userId, userId))
    .orderBy(desc(submissions.createdAt))
    .limit(limit);

  return rows as SubmissionSummary[];
}

/**
 * Szczegóły submitu wraz z wynikami per test.
 *
 * Świadomie **nie** zwraca `stderr` ani `compile_output` z poszczególnych testów —
 * na ukrytych testach potrafią zdradzić dane wejściowe. Zawodnik dostaje numer
 * testu i werdykt; wyjście kompilatora wraca osobno, bo dotyczy całego submitu,
 * nie konkretnego testu.
 */
export async function findUserSubmission(
  db: Database,
  submissionId: string,
  userId: string,
): Promise<SubmissionDetail | null> {
  const [row] = await db
    .select({ ...summaryColumns, source: submissions.source })
    .from(submissions)
    .innerJoin(problems, eq(problems.id, submissions.problemId))
    .where(
      and(eq(submissions.id, submissionId), eq(submissions.userId, userId)),
    )
    .limit(1);

  if (!row) return null;

  const results = await db
    .select({
      ordinal: submissionResults.ordinal,
      verdict: submissionResults.verdict,
      time: submissionResults.time,
      memory: submissionResults.memory,
    })
    .from(submissionResults)
    .where(eq(submissionResults.submissionId, submissionId))
    .orderBy(asc(submissionResults.ordinal));

  return { ...(row as SubmissionSummary & { source: string }), results };
}
