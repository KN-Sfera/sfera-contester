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

/** Submit w `minute` minucie konkursu. */
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
  it("liczy pełne minuty w dół", () => {
    expect(minutesSinceStart(START, new Date(START.getTime() + 359_000))).toBe(5);
    expect(minutesSinceStart(START, new Date(START.getTime() + 360_000))).toBe(6);
  });
});

describe("czas i kara", () => {
  it("zaliczone za pierwszym razem nie ma kary", () => {
    const [row] = score([sub("ala", "A", "AC", 17)]);

    expect(row!.solvedCount).toBe(1);
    expect(row!.totalPenalty).toBe(17);
    expect(row!.problems[0]!.attempts).toBe(0);
  });

  it("każdy błędny submit przed AC to +20 minut", () => {
    const [row] = score([
      sub("ala", "A", "WA", 5),
      sub("ala", "A", "WA", 10),
      sub("ala", "A", "AC", 30),
    ]);

    // 30 + 2 × 20
    expect(row!.totalPenalty).toBe(70);
    expect(row!.problems[0]!.attempts).toBe(2);
  });

  it("błędne submity PO zaliczeniu nie dokładają kary", () => {
    const [row] = score([
      sub("ala", "A", "AC", 10),
      sub("ala", "A", "WA", 20),
      sub("ala", "A", "WA", 30),
    ]);

    expect(row!.totalPenalty).toBe(10);
    expect(row!.problems[0]!.attempts).toBe(0);
  });

  it("zadanie nierozwiązane nie generuje kary mimo wielu prób", () => {
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

  it("liczy się pierwsze AC, późniejsze nie zmieniają czasu", () => {
    const [row] = score([sub("ala", "A", "AC", 10), sub("ala", "A", "AC", 40)]);

    expect(row!.problems[0]!.solvedAtMinute).toBe(10);
  });

  it("submity nie muszą przychodzić w kolejności chronologicznej", () => {
    const [row] = score([
      sub("ala", "A", "AC", 30),
      sub("ala", "A", "WA", 5),
    ]);

    expect(row!.totalPenalty).toBe(50);
  });

  it("kara jest konfigurowalna", () => {
    const [row] = score([sub("ala", "A", "WA", 1), sub("ala", "A", "AC", 10)], {
      rules: { penaltyMinutes: 5 },
    });

    expect(row!.totalPenalty).toBe(15);
  });
});

describe("werdykty specjalne", () => {
  it("domyślnie błąd kompilacji nie liczy się jako próba (reguła ICPC WF)", () => {
    const [row] = score([sub("ala", "A", "CE", 5), sub("ala", "A", "AC", 10)]);

    expect(row!.totalPenalty).toBe(10);
    expect(row!.problems[0]!.attempts).toBe(0);
  });

  it("da się włączyć karanie za błąd kompilacji", () => {
    const [row] = score([sub("ala", "A", "CE", 5), sub("ala", "A", "AC", 10)], {
      rules: { compileErrorCountsAsAttempt: true },
    });

    expect(row!.totalPenalty).toBe(30);
  });

  it("błąd systemu nigdy nie obciąża zawodnika", () => {
    const [row] = score([sub("ala", "A", "SE", 5), sub("ala", "A", "AC", 10)], {
      rules: { compileErrorCountsAsAttempt: true },
    });

    expect(row!.totalPenalty).toBe(10);
  });

  it("TLE, MLE i RE liczą się jako próby", () => {
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

describe("kolejność w rankingu", () => {
  it("więcej rozwiązanych zawsze wyżej, nawet z gorszym czasem", () => {
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

  it("przy równej liczbie zadań decyduje niższa kara", () => {
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

  it("przy równej karze decyduje wcześniejsze ostatnie zaliczenie", () => {
    const rows = score(
      [
        sub("ala", "A", "AC", 10),
        sub("ala", "B", "AC", 50),
        sub("bob", "A", "AC", 30),
        sub("bob", "B", "AC", 30),
      ],
      { participants: ["ala", "bob"], problems: ["A", "B"] },
    );

    // Obie po 60 minut kary; bob skończył w 30, ala w 50.
    expect(rows.map((row) => row.participantId)).toEqual(["bob", "ala"]);
  });

  it("nierozstrzygnięty remis daje tę samą pozycję", () => {
    const rows = score(
      [sub("ala", "A", "AC", 10), sub("bob", "A", "AC", 10)],
      { participants: ["ala", "bob"] },
    );

    expect(rows.map((row) => row.rank)).toEqual([1, 1]);
  });

  it("po remisie numeracja przeskakuje, nie kontynuuje", () => {
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

  it("zarejestrowani bez submitów są w rankingu na końcu", () => {
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

  it("ignoruje submity osób spoza listy zarejestrowanych", () => {
    const rows = score(
      [sub("ala", "A", "AC", 10), sub("intruz", "A", "AC", 1)],
      { participants: ["ala"] },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.participantId).toBe("ala");
  });

  it("każdy zawodnik ma wpis dla każdego zadania konkursu", () => {
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

  it("zaczyna się na godzinę przed końcem", () => {
    const frozen = freezeStart({ ...CONTEST, unfrozen: false });

    expect(frozen).toEqual(new Date(START.getTime() + 240 * 60_000));
  });

  it("po rozmrożeniu nie obowiązuje", () => {
    expect(freezeStart({ ...CONTEST, unfrozen: true })).toBeNull();
  });

  it("zerowy freeze oznacza brak zamrożenia", () => {
    expect(
      freezeStart({ ...CONTEST, freezeMinutes: 0, unfrozen: false }),
    ).toBeNull();
  });

  it("ukrywa submity z okresu zamrożenia", () => {
    const frozenFrom = new Date(START.getTime() + 240 * 60_000);
    const { visible, hidden } = applyFreeze(
      [sub("ala", "A", "AC", 100), sub("ala", "B", "AC", 250)],
      { frozenFrom },
    );

    expect(visible).toHaveLength(1);
    expect(hidden).toHaveLength(1);
  });

  it("bez freeze'u wszystko jest widoczne", () => {
    const { visible, hidden } = applyFreeze([sub("ala", "A", "AC", 250)], {
      frozenFrom: null,
    });

    expect(visible).toHaveLength(1);
    expect(hidden).toHaveLength(0);
  });

  it("zamrożona tablica pokazuje stan sprzed freeze'u", () => {
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

    // Na zamrożonej tablicy bob ma jedno zadanie, naprawdę ma dwa.
    expect(frozenBoard.find((r) => r.participantId === "bob")!.solvedCount).toBe(1);
    expect(realBoard.find((r) => r.participantId === "bob")!.solvedCount).toBe(2);
  });
});
