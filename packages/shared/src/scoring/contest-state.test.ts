import { describe, expect, it } from "vitest";
import {
  contestEndsAt,
  contestPhase,
  secondsRemaining,
  secondsUntilStart,
} from "./contest-state.js";

const START = new Date("2026-05-01T10:00:00Z");
const WINDOW = { startsAt: START, durationMinutes: 300 };

function at(minute: number): Date {
  return new Date(START.getTime() + minute * 60_000);
}

describe("contestPhase", () => {
  it("is UPCOMING before the start", () => {
    expect(contestPhase(WINDOW, at(-1))).toBe("UPCOMING");
  });

  it("counts the exact start moment as running", () => {
    expect(contestPhase(WINDOW, START)).toBe("RUNNING");
  });

  it("is RUNNING while under way", () => {
    expect(contestPhase(WINDOW, at(150))).toBe("RUNNING");
  });

  it("still counts the final second", () => {
    expect(contestPhase(WINDOW, new Date(at(300).getTime() - 1))).toBe("RUNNING");
  });

  it("counts the exact end moment as finished", () => {
    expect(contestPhase(WINDOW, at(300))).toBe("FINISHED");
  });

  it("is FINISHED once the time is up", () => {
    expect(contestPhase(WINDOW, at(301))).toBe("FINISHED");
  });
});

describe("contestEndsAt", () => {
  it("derives the end from the duration", () => {
    expect(contestEndsAt(WINDOW)).toEqual(at(300));
  });
});

describe("secondsRemaining", () => {
  it("reports the time remaining", () => {
    expect(secondsRemaining(WINDOW, at(299))).toBe(60);
  });

  it("does not go below zero once finished", () => {
    expect(secondsRemaining(WINDOW, at(400))).toBe(0);
  });
});

describe("secondsUntilStart", () => {
  it("reports the time until the start", () => {
    expect(secondsUntilStart(WINDOW, at(-2))).toBe(120);
  });

  it("is zero once the contest has started", () => {
    expect(secondsUntilStart(WINDOW, at(10))).toBe(0);
  });
});
