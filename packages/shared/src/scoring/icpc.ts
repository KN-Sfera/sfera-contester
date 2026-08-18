import type { Verdict } from "../index.js";

/**
 * Scoring ICPC.
 *
 * A pure function with no I/O — it takes a list of submissions and the contest
 * parameters and returns a ranking. This is the most error-prone piece of the
 * whole system, so it has to be testable without a database and without a sandbox.
 */

export interface ContestRules {
  /** When the contest starts. Solve times are measured from here. */
  startsAt: Date;
  /** Penalty added for each failed submission before the accepted one. ICPC: 20. */
  penaltyMinutes: number;
  /**
   * Whether a failed compilation counts as a failed attempt.
   * At the ICPC World Finals it does not.
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
  /** Failed attempts **before** the accepted one. It stops growing after AC. */
  attempts: number;
  /** Minutes from the start to the accepted submission. `null` if unsolved. */
  solvedAtMinute: number | null;
  /** `solvedAtMinute` plus penalty. `null` if unsolved. */
  penaltyMinutes: number | null;
  /** Attempted but not yet solved — "pending" on an ICPC scoreboard. */
  pending: boolean;
}

export interface LeaderboardRow {
  rank: number;
  participantId: string;
  solvedCount: number;
  /** Total penalty across solved problems. Unsolved ones do not count at all. */
  totalPenalty: number;
  problems: ProblemResult[];
}

export interface ScoreInput {
  rules: ContestRules;
  /** Everyone registered — including those who never submitted. */
  participantIds: string[];
  problemIds: string[];
  submissions: ScoredSubmission[];
}

/** Verdicts that are not an attempt at all — our failure, not the contestant's. */
const NOT_AN_ATTEMPT: ReadonlySet<Verdict> = new Set<Verdict>(["SE"]);

export function minutesSinceStart(startsAt: Date, at: Date): number {
  // Floored, because ICPC counts whole minutes: a submission at 5:59 is minute five.
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

  // An unsolved problem carries no penalty at all, however many attempts were made.
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
 * Ordering: more problems solved ranks higher; on a tie, the lower total
 * penalty; still tied, the earlier last-solve time. A tie unresolved by all
 * three means a shared position — at ICPC two teams really can share a place.
 */
export function buildLeaderboard(input: ScoreInput): LeaderboardRow[] {
  const byParticipant = new Map<string, Map<string, ScoredSubmission[]>>();
  for (const participantId of input.participantIds) {
    byParticipant.set(participantId, new Map());
  }

  for (const submission of input.submissions) {
    // Submissions from outside the registered list are ignored — otherwise
    // removing a contestant would not remove them from the scoreboard.
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
 * Cuts off submissions made during the freeze.
 *
 * For the last `freezeMinutes` the public scoreboard shows no changes: the
 * results freeze in their pre-freeze state, and later attempts show only as
 * "pending". An admin sees everything, because an admin has to know what is
 * going on.
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
 * The moment the scoreboard freezes. `null` when the freeze has not begun yet,
 * or the contest is over and the results have been unfrozen.
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
