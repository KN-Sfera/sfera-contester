import { describe, expect, it } from "vitest";
import { mapVerdict, type Judge0Status } from "./client.js";

// Judge0 CE statuses: 1 In Queue, 2 Processing, 3 Accepted, 4 Wrong Answer,
// 5 TLE, 6 Compilation Error, 7-12 runtime errors, 13 Internal Error,
// 14 Exec Format Error.
function status(id: number, description: string): Judge0Status {
  return { id, description };
}

describe("mapVerdict", () => {
  it("maps Accepted to OK", () => {
    expect(mapVerdict(status(3, "Accepted"))).toBe("OK");
  });

  it("maps Wrong Answer to WA", () => {
    expect(mapVerdict(status(4, "Wrong Answer"))).toBe("WA");
  });

  it("maps Time Limit Exceeded to TLE", () => {
    expect(mapVerdict(status(5, "Time Limit Exceeded"))).toBe("TLE");
  });

  it("maps Compilation Error to CE", () => {
    expect(mapVerdict(status(6, "Compilation Error"))).toBe("CE");
  });

  it.each([
    [7, "Runtime Error (SIGSEGV)"],
    [8, "Runtime Error (SIGXFSZ)"],
    [9, "Runtime Error (SIGFPE)"],
    [10, "Runtime Error (SIGABRT)"],
    [11, "Runtime Error (NZEC)"],
    [12, "Runtime Error (Other)"],
  ])("maps status %i (%s) to RE", (id, description) => {
    expect(mapVerdict(status(id, description))).toBe("RE");
  });

  it("maps Internal Error and Exec Format Error to SE", () => {
    expect(mapVerdict(status(13, "Internal Error"))).toBe("SE");
    expect(mapVerdict(status(14, "Exec Format Error"))).toBe("SE");
  });

  it("recognises Memory Limit Exceeded by description, whatever the id", () => {
    // Judge0 CE reports MLE under different ids depending on the version.
    expect(mapVerdict(status(7, "Memory Limit Exceeded"))).toBe("MLE");
    expect(mapVerdict(status(17, "Memory Limit Exceeded"))).toBe("MLE");
  });

  it("lets the description win over the id", () => {
    expect(mapVerdict(status(7, "Time Limit Exceeded"))).toBe("TLE");
  });

  it("treats an unknown status as a system error", () => {
    expect(mapVerdict(status(99, "Something New"))).toBe("SE");
  });

  it("maps non-terminal statuses to SE — they should never reach here", () => {
    // executeCode calls Judge0 with wait=true, so In Queue/Processing should
    // never appear. If one slipped through we want an error, not a bogus verdict.
    expect(mapVerdict(status(1, "In Queue"))).toBe("SE");
    expect(mapVerdict(status(2, "Processing"))).toBe("SE");
  });
});
