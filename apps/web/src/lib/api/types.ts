import type { LanguageId, Verdict } from "@sfera/shared";

/**
 * Shapes of API responses.
 *
 * We do not validate them with zod: the API is ours, the domain types live in
 * `@sfera/shared`, and double validation would be cost without benefit. Form
 * *input* is validated — that data comes from a human.
 */

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: "USER" | "ADMIN";
}

export type SubmissionStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

export interface SubmissionSummary {
  id: string;
  problemSlug: string;
  problemTitle: string;
  language: LanguageId;
  status: SubmissionStatus;
  verdict: Verdict | null;
  /** The test the judge stopped on. ICPC rule. */
  failedTestOrdinal: number | null;
  maxTime: number | null;
  maxMemory: number | null;
  createdAt: string;
  judgedAt: string | null;
}

export interface SubmissionTestResult {
  ordinal: number;
  verdict: Verdict;
  time: number | null;
  memory: number | null;
}

export interface SubmissionDetail extends SubmissionSummary {
  source: string;
  results: SubmissionTestResult[];
}

/** The 202 response to `POST /api/submissions` — an id, no verdict. */
export interface CreatedSubmission {
  submissionId: string;
}

/**
 * Events from the `/api/submissions/:id/events` stream. They mirror
 * `JudgeProgressEvent` from `@sfera/queue` — the worker publishes, the API
 * passes them through unchanged.
 */
export type JudgeEvent =
  | { type: "started"; submissionId: string; totalTests: number }
  | {
      type: "test";
      submissionId: string;
      ordinal: number;
      totalTests: number;
      verdict: Verdict;
    }
  | {
      type: "done";
      submissionId: string;
      verdict: Verdict;
      failedTestOrdinal: number | null;
    }
  | { type: "failed"; submissionId: string; message: string };
