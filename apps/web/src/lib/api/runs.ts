import type { LanguageId, RunResult } from "@sfera/shared";
import { apiFetch } from "./client";

export interface RunOnceInput {
  language: LanguageId;
  source: string;
  stdin?: string;
}

/**
 * A single run against your own input — no problem, no history, no account.
 *
 * This is the scratchpad path: "does this compile and what does it print".
 * Separate from `runSamples` (a problem's samples) and from `submit` (a
 * judged attempt), because none of the three mean the same thing.
 */
export function runOnce(input: RunOnceInput): Promise<RunResult> {
  return apiFetch<RunResult>("/api/run", { method: "POST", body: input });
}
