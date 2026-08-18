import { describe, expect, it } from "vitest";
import type { Verdict } from "@sfera/shared";
import type { SubmissionSummary } from "./api/types";
import { buildProgress, progressOf } from "./progress";

function submission(
  slug: string,
  verdict: Verdict | null,
  minute: number,
): SubmissionSummary {
  return {
    id: `${slug}-${minute}`,
    problemSlug: slug,
    problemTitle: slug,
    language: "cpp",
    status: verdict ? "DONE" : "QUEUED",
    verdict,
    failedTestOrdinal: null,
    maxTime: null,
    maxMemory: null,
    createdAt: new Date(2026, 0, 1, 12, minute).toISOString(),
    judgedAt: null,
  };
}

describe("buildProgress", () => {
  it("leaves a problem with no submissions untouched", () => {
    const progress = buildProgress([]);
    expect(progressOf(progress, "echo").state).toBe("untouched");
  });

  it("marks a single accepted submission as solved with no penalty", () => {
    const progress = buildProgress([submission("echo", "AC", 1)]);
    expect(progressOf(progress, "echo")).toMatchObject({
      state: "solved",
      failedBeforeSolve: 0,
    });
  });

  it("counts failed attempts before the accepted one", () => {
    const progress = buildProgress([
      submission("echo", "WA", 1),
      submission("echo", "TLE", 2),
      submission("echo", "AC", 3),
    ]);
    expect(progressOf(progress, "echo")).toMatchObject({
      state: "solved",
      attempts: 3,
      failedBeforeSolve: 2,
    });
  });

  it("does not add penalty for failures after the accepted one", () => {
    // ICPC rule: once solved, the penalty stops growing.
    const progress = buildProgress([
      submission("echo", "AC", 1),
      submission("echo", "WA", 2),
    ]);
    expect(progressOf(progress, "echo").failedBeforeSolve).toBe(0);
  });

  it("keeps the ordering when the API returns newest first", () => {
    const progress = buildProgress([
      submission("echo", "WA", 5),
      submission("echo", "AC", 3),
    ]);
    // The accepted one came first, so the WA is "after solving" — no penalty.
    expect(progressOf(progress, "echo").failedBeforeSolve).toBe(0);
  });

  it("does not treat a queued submission as a failure", () => {
    const progress = buildProgress([submission("echo", null, 1)]);
    expect(progressOf(progress, "echo")).toMatchObject({
      state: "attempted",
      failedBeforeSolve: 0,
    });
  });

  it("keeps problems apart", () => {
    const progress = buildProgress([
      submission("echo", "AC", 1),
      submission("a-plus-b", "WA", 2),
    ]);
    expect(progressOf(progress, "echo").state).toBe("solved");
    expect(progressOf(progress, "a-plus-b").state).toBe("attempted");
  });
});
