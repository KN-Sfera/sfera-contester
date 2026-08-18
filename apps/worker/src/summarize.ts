import type { Verdict } from "@sfera/shared";
import type { TestOutcome } from "./repository.js";

export interface RunSummary {
  verdict: Exclude<Verdict, "OK">;
  /** The test it failed on. `null` when accepted. */
  failedTestOrdinal: number | null;
  maxTime: number | null;
  maxMemory: number | null;
}

/**
 * Folds the individual test results into a verdict for the whole submission.
 *
 * A pure function with no I/O — this is the most error-prone piece of judging,
 * so it has to be testable without a database and without Judge0.
 */
export function summarizeRun(outcomes: TestOutcome[]): RunSummary {
  if (outcomes.length === 0) {
    // A problem with no tests is not solved — that is a misconfiguration, not a success.
    return { verdict: "SE", failedTestOrdinal: null, maxTime: null, maxMemory: null };
  }

  const failed = outcomes.find((outcome) => outcome.verdict !== "AC");

  const times = outcomes
    .map((outcome) => outcome.time)
    .filter((time): time is number => time !== null);
  const memories = outcomes
    .map((outcome) => outcome.memory)
    .filter((memory): memory is number => memory !== null);

  return {
    verdict: failed ? failed.verdict : "AC",
    failedTestOrdinal: failed ? failed.ordinal : null,
    maxTime: times.length > 0 ? Math.max(...times) : null,
    maxMemory: memories.length > 0 ? Math.max(...memories) : null,
  };
}

/** Judge0 reports the time as a string of seconds, or null. */
export function parseTime(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
