import type { Verdict } from "@sfera/shared";
import type { TestOutcome } from "./repository.js";

export interface RunSummary {
  verdict: Exclude<Verdict, "OK">;
  /** Numer testu, na którym poległo. `null` przy AC. */
  failedTestOrdinal: number | null;
  maxTime: number | null;
  maxMemory: number | null;
}

/**
 * Zbiera wyniki poszczególnych testów w werdykt całego submitu.
 *
 * Czysta funkcja bez I/O — to najbardziej podatny na błędy fragment oceniania,
 * więc musi dać się przetestować bez bazy i bez Judge0.
 */
export function summarizeRun(outcomes: TestOutcome[]): RunSummary {
  if (outcomes.length === 0) {
    // Zadanie bez testów nie jest zaliczone — to błąd konfiguracji, nie sukces.
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

/** Judge0 podaje czas jako string sekund albo null. */
export function parseTime(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
