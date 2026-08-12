import { describe, expect, it } from "vitest";
import { mapVerdict, type Judge0Status } from "./client.js";

// Statusy Judge0 CE: 1 In Queue, 2 Processing, 3 Accepted, 4 Wrong Answer,
// 5 TLE, 6 Compilation Error, 7-12 błędy wykonania, 13 Internal Error,
// 14 Exec Format Error.
function status(id: number, description: string): Judge0Status {
  return { id, description };
}

describe("mapVerdict", () => {
  it("mapuje Accepted na OK", () => {
    expect(mapVerdict(status(3, "Accepted"))).toBe("OK");
  });

  it("mapuje Wrong Answer na WA", () => {
    expect(mapVerdict(status(4, "Wrong Answer"))).toBe("WA");
  });

  it("mapuje Time Limit Exceeded na TLE", () => {
    expect(mapVerdict(status(5, "Time Limit Exceeded"))).toBe("TLE");
  });

  it("mapuje Compilation Error na CE", () => {
    expect(mapVerdict(status(6, "Compilation Error"))).toBe("CE");
  });

  it.each([
    [7, "Runtime Error (SIGSEGV)"],
    [8, "Runtime Error (SIGXFSZ)"],
    [9, "Runtime Error (SIGFPE)"],
    [10, "Runtime Error (SIGABRT)"],
    [11, "Runtime Error (NZEC)"],
    [12, "Runtime Error (Other)"],
  ])("mapuje status %i (%s) na RE", (id, description) => {
    expect(mapVerdict(status(id, description))).toBe("RE");
  });

  it("mapuje Internal Error i Exec Format Error na SE", () => {
    expect(mapVerdict(status(13, "Internal Error"))).toBe("SE");
    expect(mapVerdict(status(14, "Exec Format Error"))).toBe("SE");
  });

  it("rozpoznaje Memory Limit Exceeded po opisie, niezależnie od id", () => {
    // Judge0 CE zgłasza MLE pod różnymi id w zależności od wersji.
    expect(mapVerdict(status(7, "Memory Limit Exceeded"))).toBe("MLE");
    expect(mapVerdict(status(17, "Memory Limit Exceeded"))).toBe("MLE");
  });

  it("opis ma pierwszeństwo przed id", () => {
    expect(mapVerdict(status(7, "Time Limit Exceeded"))).toBe("TLE");
  });

  it("nieznany status jest traktowany jako błąd systemu", () => {
    expect(mapVerdict(status(99, "Something New"))).toBe("SE");
  });

  it("statusy nieterminalne nie powinny trafiać do mapowania — dają SE", () => {
    // executeCode woła Judge0 z wait=true, więc In Queue/Processing nie powinny
    // się pojawić. Gdyby jednak przeszły, chcemy błąd, nie fałszywy werdykt.
    expect(mapVerdict(status(1, "In Queue"))).toBe("SE");
    expect(mapVerdict(status(2, "Processing"))).toBe("SE");
  });
});
