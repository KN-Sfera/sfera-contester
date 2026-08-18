import { describe, expect, it } from "vitest";
import { BALLOON_COUNT, balloonColor, balloonIndex, problemLetter } from "./balloon";

describe("balloonIndex", () => {
  it("returns the same colour on every call", () => {
    // This is the whole point: a problem's colour has to stay constant across
    // views, across refreshes, and between the server and the client.
    expect(balloonIndex("a-plus-b")).toBe(balloonIndex("a-plus-b"));
  });

  it("stays inside the palette", () => {
    for (const slug of ["a", "bb", "shortest-path", "x-9", ""]) {
      const index = balloonIndex(slug);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(BALLOON_COUNT);
    }
  });

  it("spreads near-identical slugs across different inks", () => {
    // Problems in a set often have near-identical names; if the hash clumped
    // them, half the scoreboard would be one colour and balloons would stop
    // meaning anything.
    const slugs = Array.from({ length: 12 }, (_, i) => `problem-${i + 1}`);
    const distinct = new Set(slugs.map(balloonIndex));
    expect(distinct.size).toBeGreaterThanOrEqual(6);
  });

  it("returns a CSS variable rather than a hex — the ink is theme-dependent", () => {
    expect(balloonColor("echo")).toMatch(/^var\(--balloon-\d+\)$/);
  });
});

describe("problemLetter", () => {
  it("numbers problems the ICPC way", () => {
    expect(problemLetter(0)).toBe("A");
    expect(problemLetter(2)).toBe("C");
    expect(problemLetter(25)).toBe("Z");
  });

  it("moves to two letters past Z", () => {
    expect(problemLetter(26)).toBe("AA");
    expect(problemLetter(27)).toBe("AB");
    expect(problemLetter(51)).toBe("AZ");
    expect(problemLetter(52)).toBe("BA");
  });

  it("does not blow up on a problem missing from the list", () => {
    expect(problemLetter(-1)).toBe("?");
  });
});
