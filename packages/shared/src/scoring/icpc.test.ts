import { describe, expect, it } from "vitest";
import type { Verdict } from "../index.js";
import {
  applyFreeze,
  buildLeaderboard,
  freezeStart,
  minutesSinceStart,
  type ContestRules,
  type ScoredSubmission,
} from "./icpc.js";

const START = new Date("2026-05-01T10:00:00Z");

const RULES: ContestRules = {
  startsAt: START,
  penaltyMinutes: 20,
  compileErrorCountsAsAttempt: false,
};

/** A submission at contest minute `minute`. */
function sub(
  participantId: string,
  problemId: string,
  verdict: Verdict,
  minute: number,
): ScoredSubmission {
  return {
    participantId,
    problemId,
    verdict,
    createdAt: new Date(START.getTime() + minute * 60_000),
  };
}

function score(
  submissions: ScoredSubmission[],
  options: {
    participants?: string[];
    problems?: string[];
    rules?: Partial<ContestRules>;
  } = {},
) {
  return buildLeaderboard({
    rules: { ...RULES, ...options.rules },
    participantIds: options.participants ?? ["ala"],
    problemIds: options.problems ?? ["A"],
    submissions,
  });
}

describe("minutesSinceStart", () => {
  it("floors to whole minutes", () => {
    expect(minutesSinceStart(START, new Date(START.getTime() + 359_000))).toBe(5);
    expect(minutesSinceStart(START, new Date(START.getTime() + 360_000))).toBe(6);
  });
});

describe("time and penalty", () => {
  it("charges no penalty when solved first try", () => {
    const [row] = score([sub("ala", "A", "AC", 17)]);

    expect(row!.solvedCount).toBe(1);
    expect(row!.totalPenalty).toBe(17);
    expect(row!.problems[0]!.attempts).toBe(0);
  });

  it("adds 20 minutes per failed submission before the accepted one", () => {
    const [row] = score([
      sub("ala", "A", "WA", 5),
      sub("ala", "A", "WA", 10),
      sub("ala", "A", "AC", 30),
    ]);

    // 30 + 2 × 20
    expect(row!.totalPenalty).toBe(70);
    expect(row!.problems[0]!.attempts).toBe(2);
  });

  it("ignores failed submissions AFTER the accepted one", () => {
    const [row] = score([
      sub("ala", "A", "AC", 10),
      sub("ala", "A", "WA", 20),
      sub("ala", "A", "WA", 30),
    ]);

    expect(row!.totalPenalty).toBe(10);
    expect(row!.problems[0]!.attempts).toBe(0);
  });

  it("charges no penalty for an unsolved problem, however many attempts", () => {
    const [row] = score([
      sub("ala", "A", "WA", 5),
      sub("ala", "A", "TLE", 15),
      sub("ala", "A", "RE", 25),
    ]);

    expect(row!.solvedCount).toBe(0);
    expect(row!.totalPenalty).toBe(0);
    expect(row!.problems[0]!.penaltyMinutes).toBeNull();
    expect(row!.problems[0]!.pending).toBe(true);
  });

  it("counts the first accepted submission; later ones do not change the time", () => {
    const [row] = score([sub("ala", "A", "AC", 10), sub("ala", "A", "AC", 40)]);

    expect(row!.problems[0]!.solvedAtMinute).toBe(10);
  });

  it("does not require submissions to arrive in chronological order", () => {
    const [row] = score([
      sub("ala", "A", "AC", 30),
      sub("ala", "A", "WA", 5),
    ]);

    expect(row!.totalPenalty).toBe(50);
  });

  it("takes the penalty from the contest rules", () => {
    const [row] = score([sub("ala", "A", "WA", 1), sub("ala", "A", "AC", 10)], {
      rules: { penaltyMinutes: 5 },
    });

    expect(row!.totalPenalty).toBe(15);
  });
});

describe("special verdicts", () => {
  it("does not count a compilation error as an attempt by default (ICPC WF rule)", () => {
    const [row] = score([sub("ala", "A", "CE", 5), sub("ala", "A", "AC", 10)]);

    expect(row!.totalPenalty).toBe(10);
    expect(row!.problems[0]!.attempts).toBe(0);
  });

  it("can be configured to penalise compilation errors", () => {
    const [row] = score([sub("ala", "A", "CE", 5), sub("ala", "A", "AC", 10)], {
      rules: { compileErrorCountsAsAttempt: true },
    });

    expect(row!.totalPenalty).toBe(30);
  });

  it("never charges a contestant for a system error", () => {
    const [row] = score([sub("ala", "A", "SE", 5), sub("ala", "A", "AC", 10)], {
      rules: { compileErrorCountsAsAttempt: true },
    });

    expect(row!.totalPenalty).toBe(10);
  });

  it("counts TLE, MLE and RE as attempts", () => {
    const [row] = score([
      sub("ala", "A", "TLE", 1),
      sub("ala", "A", "MLE", 2),
      sub("ala", "A", "RE", 3),
      sub("ala", "A", "AC", 10),
    ]);

    expect(row!.problems[0]!.attempts).toBe(3);
    expect(row!.totalPenalty).toBe(70);
  });
});

describe("ranking order", () => {
  it("always ranks more solved problems higher, even with a worse time", () => {
    const rows = score(
      [
        sub("ala", "A", "AC", 200),
        sub("ala", "B", "AC", 250),
        sub("bob", "A", "AC", 1),
      ],
      { participants: ["ala", "bob"], problems: ["A", "B"] },
    );

    expect(rows.map((row) => row.participantId)).toEqual(["ala", "bob"]);
  });

  it("breaks a tie on problem count by the lower penalty", () => {
    const rows = score(
      [
        sub("ala", "A", "WA", 1),
        sub("ala", "A", "AC", 10),
        sub("bob", "A", "AC", 15),
      ],
      { participants: ["ala", "bob"] },
    );

    // ala: 10 + 20 = 30, bob: 15
    expect(rows.map((row) => row.participantId)).toEqual(["bob", "ala"]);
  });

  it("breaks a tie on penalty by the earlier last solve", () => {
    const rows = score(
      [
        sub("ala", "A", "AC", 10),
        sub("ala", "B", "AC", 50),
        sub("bob", "A", "AC", 30),
        sub("bob", "B", "AC", 30),
      ],
      { participants: ["ala", "bob"], problems: ["A", "B"] },
    );

    // Both on 60 penalty minutes; bob finished at 30, ala at 50.
    expect(rows.map((row) => row.participantId)).toEqual(["bob", "ala"]);
  });

  it("gives an unresolved tie the same position", () => {
    const rows = score(
      [sub("ala", "A", "AC", 10), sub("bob", "A", "AC", 10)],
      { participants: ["ala", "bob"] },
    );

    expect(rows.map((row) => row.rank)).toEqual([1, 1]);
  });

  it("skips numbers after a tie instead of continuing", () => {
    const rows = score(
      [
        sub("ala", "A", "AC", 10),
        sub("bob", "A", "AC", 10),
        sub("cez", "A", "AC", 20),
      ],
      { participants: ["ala", "bob", "cez"] },
    );

    expect(rows.map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  it("places registered contestants with no submissions at the bottom", () => {
    const rows = score([sub("ala", "A", "AC", 10)], {
      participants: ["ala", "widmo"],
    });

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      participantId: "widmo",
      solvedCount: 0,
      totalPenalty: 0,
    });
  });

  it("ignores submissions from outside the registered list", () => {
    const rows = score(
      [sub("ala", "A", "AC", 10), sub("intruz", "A", "AC", 1)],
      { participants: ["ala"] },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.participantId).toBe("ala");
  });

  it("gives every contestant an entry for every contest problem", () => {
    const rows = score([], { problems: ["A", "B", "C"] });

    expect(rows[0]!.problems.map((problem) => problem.problemId)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });
});

describe("freeze", () => {
  const CONTEST = {
    startsAt: START,
    durationMinutes: 300,
    freezeMinutes: 60,
  };

  it("starts an hour before the end", () => {
    const frozen = freezeStart({ ...CONTEST, unfrozen: false });

    expect(frozen).toEqual(new Date(START.getTime() + 240 * 60_000));
  });

  it("no longer applies once unfrozen", () => {
    expect(freezeStart({ ...CONTEST, unfrozen: true })).toBeNull();
  });

  it("treats a zero freeze as no freeze at all", () => {
    expect(
      freezeStart({ ...CONTEST, freezeMinutes: 0, unfrozen: false }),
    ).toBeNull();
  });

  it("hides submissions made during the freeze", () => {
    const frozenFrom = new Date(START.getTime() + 240 * 60_000);
    const { visible, hidden } = applyFreeze(
      [sub("ala", "A", "AC", 100), sub("ala", "B", "AC", 250)],
      { frozenFrom },
    );

    expect(visible).toHaveLength(1);
    expect(hidden).toHaveLength(1);
  });

  it("shows everything when there is no freeze", () => {
    const { visible, hidden } = applyFreeze([sub("ala", "A", "AC", 250)], {
      frozenFrom: null,
    });

    expect(visible).toHaveLength(1);
    expect(hidden).toHaveLength(0);
  });

  it("shows the pre-freeze state on a frozen scoreboard", () => {
    const frozenFrom = new Date(START.getTime() + 240 * 60_000);
    const all = [
      sub("ala", "A", "AC", 100),
      sub("bob", "A", "AC", 50),
      sub("bob", "B", "AC", 250),
    ];

    const { visible } = applyFreeze(all, { frozenFrom });
    const frozenBoard = buildLeaderboard({
      rules: RULES,
      participantIds: ["ala", "bob"],
      problemIds: ["A", "B"],
      submissions: visible,
    });
    const realBoard = buildLeaderboard({
      rules: RULES,
      participantIds: ["ala", "bob"],
      problemIds: ["A", "B"],
      submissions: all,
    });

    // On the frozen scoreboard bob has one problem; in truth he has two.
    expect(frozenBoard.find((r) => r.participantId === "bob")!.solvedCount).toBe(1);
    expect(realBoard.find((r) => r.participantId === "bob")!.solvedCount).toBe(2);
  });
});
