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
  it("returns AC with no failing test number when every test passes", () => {
    const summary = summarizeRun([
      outcome({ ordinal: 1 }),
      outcome({ ordinal: 2 }),
    ]);

    expect(summary.verdict).toBe("AC");
    expect(summary.failedTestOrdinal).toBeNull();
  });

  it("takes the verdict of the first failing test", () => {
    const summary = summarizeRun([
      outcome({ ordinal: 1 }),
      outcome({ ordinal: 2, verdict: "TLE" }),
    ]);

    expect(summary.verdict).toBe("TLE");
    expect(summary.failedTestOrdinal).toBe(2);
  });

  it("reports the first failure when several fail", () => {
    const summary = summarizeRun([
      outcome({ ordinal: 1, verdict: "WA" }),
      outcome({ ordinal: 2, verdict: "RE" }),
    ]);

    expect(summary.verdict).toBe("WA");
    expect(summary.failedTestOrdinal).toBe(1);
  });

  it("takes the worst time and memory across the tests", () => {
    const summary = summarizeRun([
      outcome({ ordinal: 1, time: 0.1, memory: 2048 }),
      outcome({ ordinal: 2, time: 0.9, memory: 1024 }),
      outcome({ ordinal: 3, time: 0.4, memory: 4096 }),
    ]);

    expect(summary.maxTime).toBe(0.9);
    expect(summary.maxMemory).toBe(4096);
  });

  it("copes with missing measurements", () => {
    const summary = summarizeRun([outcome({ ordinal: 1 })]);

    expect(summary.maxTime).toBeNull();
    expect(summary.maxMemory).toBeNull();
  });

  it("skips missing measurements when only some tests report them", () => {
    const summary = summarizeRun([
      outcome({ ordinal: 1, time: null }),
      outcome({ ordinal: 2, time: 0.3 }),
    ]);

    expect(summary.maxTime).toBe(0.3);
  });

  it("treats a problem with no tests as a system error, not a pass", () => {
    const summary = summarizeRun([]);

    expect(summary.verdict).toBe("SE");
    expect(summary.failedTestOrdinal).toBeNull();
  });
});

describe("parseTime", () => {
  it("turns Judge0 seconds into a number", () => {
    expect(parseTime("0.002")).toBe(0.002);
    expect(parseTime("1")).toBe(1);
  });

  it("leaves a missing measurement as null", () => {
    expect(parseTime(null)).toBeNull();
  });

  it("does not let garbage become NaN in the database", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("brak")).toBeNull();
  });
});
