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
  it("przed startem to UPCOMING", () => {
    expect(contestPhase(WINDOW, at(-1))).toBe("UPCOMING");
  });

  it("dokładnie w momencie startu konkurs już trwa", () => {
    expect(contestPhase(WINDOW, START)).toBe("RUNNING");
  });

  it("w trakcie to RUNNING", () => {
    expect(contestPhase(WINDOW, at(150))).toBe("RUNNING");
  });

  it("ostatnia sekunda jeszcze się liczy", () => {
    expect(contestPhase(WINDOW, new Date(at(300).getTime() - 1))).toBe("RUNNING");
  });

  it("dokładnie w momencie końca konkurs jest zamknięty", () => {
    expect(contestPhase(WINDOW, at(300))).toBe("FINISHED");
  });

  it("po czasie to FINISHED", () => {
    expect(contestPhase(WINDOW, at(301))).toBe("FINISHED");
  });
});

describe("contestEndsAt", () => {
  it("liczy koniec z długości trwania", () => {
    expect(contestEndsAt(WINDOW)).toEqual(at(300));
  });
});

describe("secondsRemaining", () => {
  it("podaje czas do końca", () => {
    expect(secondsRemaining(WINDOW, at(299))).toBe(60);
  });

  it("po zakończeniu nie schodzi poniżej zera", () => {
    expect(secondsRemaining(WINDOW, at(400))).toBe(0);
  });
});

describe("secondsUntilStart", () => {
  it("podaje czas do startu", () => {
    expect(secondsUntilStart(WINDOW, at(-2))).toBe(120);
  });

  it("po starcie to zero", () => {
    expect(secondsUntilStart(WINDOW, at(10))).toBe(0);
  });
});
