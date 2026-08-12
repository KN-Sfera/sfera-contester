import type { Verdict } from "../index.js";

/**
 * Scoring ICPC.
 *
 * Czysta funkcja bez I/O — bierze listę submitów i parametry konkursu, oddaje
 * ranking. To najbardziej podatny na błędy fragment całego systemu, więc musi
 * dać się przetestować bez bazy i bez sandboxa.
 */

export interface ContestRules {
  /** Moment startu konkursu. Od niego liczymy czas rozwiązania. */
  startsAt: Date;
  /** Kara doliczana za każdy błędny submit przed zaliczeniem. ICPC: 20. */
  penaltyMinutes: number;
  /**
   * Czy nieudana kompilacja liczy się jako błędny submit.
   * Na ICPC World Finals — nie.
   */
  compileErrorCountsAsAttempt: boolean;
}

export interface ScoredSubmission {
  participantId: string;
  problemId: string;
  verdict: Verdict;
  createdAt: Date;
}

export interface ProblemResult {
  problemId: string;
  solved: boolean;
  /** Liczba błędnych prób **przed** zaliczeniem. Po AC już nie rośnie. */
  attempts: number;
  /** Minuty od startu do AC. `null` gdy nierozwiązane. */
  solvedAtMinute: number | null;
  /** `solvedAtMinute` + kara. `null` gdy nierozwiązane. */
  penaltyMinutes: number | null;
  /** Zawodnik próbował, ale jeszcze nie zaliczył — „pending" na tablicy ICPC. */
  pending: boolean;
}

export interface LeaderboardRow {
  rank: number;
  participantId: string;
  solvedCount: number;
  /** Suma kar za zaliczone zadania. Nierozwiązane nie wliczają się wcale. */
  totalPenalty: number;
  problems: ProblemResult[];
}

export interface ScoreInput {
  rules: ContestRules;
  /** Wszyscy zarejestrowani — także ci bez ani jednego submitu. */
  participantIds: string[];
  problemIds: string[];
  submissions: ScoredSubmission[];
}

/** Werdykty, które w ogóle nie są próbą — błąd po naszej stronie, nie zawodnika. */
const NOT_AN_ATTEMPT: ReadonlySet<Verdict> = new Set<Verdict>(["SE"]);

export function minutesSinceStart(startsAt: Date, at: Date): number {
  // Podłoga, bo ICPC liczy pełne minuty: submit w 5:59 to piąta minuta.
  return Math.floor((at.getTime() - startsAt.getTime()) / 60_000);
}

function countsAsAttempt(verdict: Verdict, rules: ContestRules): boolean {
  if (verdict === "AC") return false;
  if (NOT_AN_ATTEMPT.has(verdict)) return false;
  if (verdict === "CE") return rules.compileErrorCountsAsAttempt;
  return true;
}

function scoreProblem(
  problemId: string,
  submissions: ScoredSubmission[],
  rules: ContestRules,
): ProblemResult {
  const ordered = [...submissions].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  let attempts = 0;
  for (const submission of ordered) {
    if (submission.verdict === "AC") {
      const solvedAtMinute = minutesSinceStart(
        rules.startsAt,
        submission.createdAt,
      );
      return {
        problemId,
        solved: true,
        attempts,
        solvedAtMinute,
        penaltyMinutes: solvedAtMinute + attempts * rules.penaltyMinutes,
        pending: false,
      };
    }
    if (countsAsAttempt(submission.verdict, rules)) {
      attempts += 1;
    }
  }

  // Zadanie nierozwiązane: kary nie liczymy wcale, nawet po wielu próbach.
  return {
    problemId,
    solved: false,
    attempts,
    solvedAtMinute: null,
    penaltyMinutes: null,
    pending: ordered.length > 0,
  };
}

/**
 * Buduje ranking.
 *
 * Kolejność: więcej rozwiązanych wyżej; przy remisie niższa suma kar; przy
 * dalszym remisie wcześniejszy czas ostatniego zaliczenia. Remis nierozstrzygnięty
 * po tych trzech kryteriach oznacza tę samą pozycję — na ICPC dwie drużyny
 * naprawdę mogą dzielić miejsce.
 */
export function buildLeaderboard(input: ScoreInput): LeaderboardRow[] {
  const byParticipant = new Map<string, Map<string, ScoredSubmission[]>>();
  for (const participantId of input.participantIds) {
    byParticipant.set(participantId, new Map());
  }

  for (const submission of input.submissions) {
    // Submity spoza listy zarejestrowanych ignorujemy — inaczej wykreślenie
    // zawodnika nie usuwałoby go z tablicy.
    const problems = byParticipant.get(submission.participantId);
    if (!problems) continue;

    const list = problems.get(submission.problemId) ?? [];
    list.push(submission);
    problems.set(submission.problemId, list);
  }

  const rows = input.participantIds.map((participantId) => {
    const problems = input.problemIds.map((problemId) =>
      scoreProblem(
        problemId,
        byParticipant.get(participantId)?.get(problemId) ?? [],
        input.rules,
      ),
    );

    const solved = problems.filter((problem) => problem.solved);

    return {
      rank: 0,
      participantId,
      solvedCount: solved.length,
      totalPenalty: solved.reduce(
        (sum, problem) => sum + (problem.penaltyMinutes ?? 0),
        0,
      ),
      problems,
      lastSolvedAt: solved.reduce(
        (latest, problem) => Math.max(latest, problem.solvedAtMinute ?? 0),
        0,
      ),
    };
  });

  rows.sort((a, b) => {
    if (a.solvedCount !== b.solvedCount) return b.solvedCount - a.solvedCount;
    if (a.totalPenalty !== b.totalPenalty) return a.totalPenalty - b.totalPenalty;
    return a.lastSolvedAt - b.lastSolvedAt;
  });

  let previous: (typeof rows)[number] | null = null;
  let previousRank = 0;

  return rows.map(({ lastSolvedAt, ...row }, index) => {
    const tied =
      previous !== null &&
      previous.solvedCount === row.solvedCount &&
      previous.totalPenalty === row.totalPenalty &&
      previous.lastSolvedAt === lastSolvedAt;

    const rank = tied ? previousRank : index + 1;
    previous = { ...row, lastSolvedAt };
    previousRank = rank;

    return { ...row, rank };
  });
}

/**
 * Odcina submity z okresu zamrożenia.
 *
 * Publiczna tablica przez ostatnie `freezeMinutes` nie pokazuje zmian: wyniki
 * zamrażają się w stanie sprzed freeze'u, a późniejsze próby są widoczne tylko
 * jako „pending". Admin dostaje komplet, bo musi wiedzieć, co się dzieje.
 */
export function applyFreeze(
  submissions: ScoredSubmission[],
  options: { frozenFrom: Date | null },
): { visible: ScoredSubmission[]; hidden: ScoredSubmission[] } {
  if (!options.frozenFrom) {
    return { visible: submissions, hidden: [] };
  }

  const visible: ScoredSubmission[] = [];
  const hidden: ScoredSubmission[] = [];
  for (const submission of submissions) {
    if (submission.createdAt.getTime() < options.frozenFrom.getTime()) {
      visible.push(submission);
    } else {
      hidden.push(submission);
    }
  }
  return { visible, hidden };
}

/**
 * Moment, od którego tablica jest zamrożona. `null` gdy freeze jeszcze nie
 * zaczął obowiązywać albo konkurs się skończył i wyniki są już odmrożone.
 */
export function freezeStart(options: {
  startsAt: Date;
  durationMinutes: number;
  freezeMinutes: number;
  unfrozen: boolean;
}): Date | null {
  if (options.unfrozen || options.freezeMinutes <= 0) return null;

  const endsAt = options.startsAt.getTime() + options.durationMinutes * 60_000;
  return new Date(endsAt - options.freezeMinutes * 60_000);
}
