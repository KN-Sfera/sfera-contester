import { describe, expect, it } from "vitest";
import type { TestOutcome } from "./repository.js";
import { parseTime, summarizeRun } from "./summarize.js";

function outcome(partial: Partial<TestOutcome> & { ordinal: number }): TestOutcome {
  return {
    testCaseId: `test-${partial.ordinal}`,
    verdict: "AC",
    time: null,
    memory: null,
    stderr: "",
    compileOutput: "",
    ...partial,
  };
}

describe("summarizeRun", () => {
  it("same AC dają AC bez numeru błędnego testu", () => {
    const summary = summarizeRun([
      outcome({ ordinal: 1 }),
      outcome({ ordinal: 2 }),
    ]);

    expect(summary.verdict).toBe("AC");
    expect(summary.failedTestOrdinal).toBeNull();
  });

  it("przejmuje werdykt pierwszego niezaliczonego testu", () => {
    const summary = summarizeRun([
      outcome({ ordinal: 1 }),
      outcome({ ordinal: 2, verdict: "TLE" }),
    ]);

    expect(summary.verdict).toBe("TLE");
    expect(summary.failedTestOrdinal).toBe(2);
  });

  it("przy kilku błędach liczy się pierwszy", () => {
    const summary = summarizeRun([
      outcome({ ordinal: 1, verdict: "WA" }),
      outcome({ ordinal: 2, verdict: "RE" }),
    ]);

    expect(summary.verdict).toBe("WA");
    expect(summary.failedTestOrdinal).toBe(1);
  });

  it("bierze najgorszy czas i pamięć ze wszystkich testów", () => {
    const summary = summarizeRun([
      outcome({ ordinal: 1, time: 0.1, memory: 2048 }),
      outcome({ ordinal: 2, time: 0.9, memory: 1024 }),
      outcome({ ordinal: 3, time: 0.4, memory: 4096 }),
    ]);

    expect(summary.maxTime).toBe(0.9);
    expect(summary.maxMemory).toBe(4096);
  });

  it("radzi sobie z brakiem pomiarów", () => {
    const summary = summarizeRun([outcome({ ordinal: 1 })]);

    expect(summary.maxTime).toBeNull();
    expect(summary.maxMemory).toBeNull();
  });

  it("pomija brakujące pomiary, gdy część testów je ma", () => {
    const summary = summarizeRun([
      outcome({ ordinal: 1, time: null }),
      outcome({ ordinal: 2, time: 0.3 }),
    ]);

    expect(summary.maxTime).toBe(0.3);
  });

  it("zadanie bez testów to błąd systemu, nie zaliczenie", () => {
    const summary = summarizeRun([]);

    expect(summary.verdict).toBe("SE");
    expect(summary.failedTestOrdinal).toBeNull();
  });
});

describe("parseTime", () => {
  it("zamienia sekundy z Judge0 na liczbę", () => {
    expect(parseTime("0.002")).toBe(0.002);
    expect(parseTime("1")).toBe(1);
  });

  it("brak pomiaru zostaje nullem", () => {
    expect(parseTime(null)).toBeNull();
  });

  it("śmieci nie stają się NaN w bazie", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("brak")).toBeNull();
  });
});
