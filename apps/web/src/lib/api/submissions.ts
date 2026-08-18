import type { LanguageId, RunSamplesResult } from "@sfera/shared";
import { apiFetch } from "./client";
import type {
  CreatedSubmission,
  SubmissionDetail,
  SubmissionSummary,
} from "./types";

export interface SubmitInput {
  problemSlug: string;
  language: LanguageId;
  source: string;
}

/**
 * Sends a solution to be judged. The API answers 202 with an id alone — the
 * verdict arrives later over SSE.
 */
export function submit(input: SubmitInput): Promise<CreatedSubmission> {
  return apiFetch<CreatedSubmission>("/api/submissions", {
    method: "POST",
    body: input,
  });
}

export function listSubmissions(): Promise<SubmissionSummary[]> {
  return apiFetch<SubmissionSummary[]>("/api/submissions", {
    cache: "no-store",
  });
}

export function getSubmission(id: string): Promise<SubmissionDetail> {
  return apiFetch<SubmissionDetail>(
    `/api/submissions/${encodeURIComponent(id)}`,
    { cache: "no-store" },
  );
}

/**
 * Running against the samples — synchronous, never recorded in history.
 * A separate path from submitting: this is "does it work at all", not an
 * attempt at the problem.
 */
export function runSamples(input: SubmitInput): Promise<RunSamplesResult> {
  return apiFetch<RunSamplesResult>("/api/run-samples", {
    method: "POST",
    body: input,
  });
}
