import type { ContestRow, Database } from "@sfera/db";
import type { JudgeQueue } from "@sfera/queue";
import {
  applyFreeze,
  buildLeaderboard,
  contestPhase,
  freezeStart,
  secondsRemaining,
  secondsUntilStart,
  type LeaderboardRow,
  type LanguageId,
} from "@sfera/shared";
import { createSubmission } from "../submissions/repository.js";
import {
  isRegistered,
  listContestProblems,
  listParticipants,
  loadScoredSubmissions,
  type ContestProblemEntry,
} from "./repository.js";

export class ContestNotFoundError extends Error {
  constructor(slug: string) {
    super(`No such contest: ${slug}`);
    this.name = "ContestNotFoundError";
  }
}

export class NotRegisteredError extends Error {
  constructor() {
    super("You are not registered for this contest");
    this.name = "NotRegisteredError";
  }
}

export class ContestNotRunningError extends Error {
  constructor(readonly phase: "UPCOMING" | "FINISHED") {
    super(
      phase === "UPCOMING"
        ? "The contest has not started yet"
        : "The contest is already over",
    );
    this.name = "ContestNotRunningError";
  }
}

export class ProblemNotInContestError extends Error {
  constructor(letter: string) {
    super(`Problem ${letter} does not belong to this contest`);
    this.name = "ProblemNotInContestError";
  }
}

/**
 * Contest problems become visible only after the start.
 *
 * This is not cosmetic: if the list leaked earlier, contestants would have time
 * to prepare before the signal. Admins always see them.
 */
export async function getContestProblems(
  db: Database,
  contest: ContestRow,
  options: { isAdmin: boolean; now?: Date },
): Promise<ContestProblemEntry[]> {
  const phase = contestPhase(contest, options.now);
  if (!options.isAdmin && phase === "UPCOMING") return [];
  return listContestProblems(db, contest.id);
}

export interface ContestOverview {
  slug: string;
  title: string;
  description: string;
  startsAt: Date;
  durationMinutes: number;
  penaltyMinutes: number;
  freezeMinutes: number;
  phase: "UPCOMING" | "RUNNING" | "FINISHED";
  /** The clock is kept server-side — the browser only displays it. */
  secondsUntilStart: number;
  secondsRemaining: number;
  serverTime: Date;
  frozen: boolean;
  registrationOpen: boolean;
  registered: boolean;
}

export async function getContestOverview(
  db: Database,
  contest: ContestRow,
  options: { userId: string | null; now?: Date },
): Promise<ContestOverview> {
  const now = options.now ?? new Date();
  const phase = contestPhase(contest, now);
  const frozenFrom = freezeStart({ ...contest, unfrozen: contest.unfrozen });

  return {
    slug: contest.slug,
    title: contest.title,
    description: contest.description,
    startsAt: contest.startsAt,
    durationMinutes: contest.durationMinutes,
    penaltyMinutes: contest.penaltyMinutes,
    freezeMinutes: contest.freezeMinutes,
    phase,
    secondsUntilStart: secondsUntilStart(contest, now),
    secondsRemaining: secondsRemaining(contest, now),
    serverTime: now,
    frozen: frozenFrom !== null && now.getTime() >= frozenFrom.getTime(),
    registrationOpen: contest.registrationOpen,
    registered: options.userId
      ? await isRegistered(db, contest.id, options.userId)
      : false,
  };
}

export interface ContestSubmitInput {
  userId: string;
  letter: string;
  language: LanguageId;
  source: string;
}

/**
 * A contest submission. Beyond the usual validation it enforces three things:
 * the contestant is registered, the contest is running, and the problem belongs
 * to it.
 */
export async function submitToContest(
  db: Database,
  queue: JudgeQueue,
  contest: ContestRow,
  input: ContestSubmitInput,
  now: Date = new Date(),
): Promise<{ submissionId: string }> {
  if (!(await isRegistered(db, contest.id, input.userId))) {
    throw new NotRegisteredError();
  }

  const phase = contestPhase(contest, now);
  if (phase !== "RUNNING") {
    throw new ContestNotRunningError(phase);
  }

  const contestProblemList = await listContestProblems(db, contest.id);
  const entry = contestProblemList.find(
    (problem) => problem.letter === input.letter.toUpperCase(),
  );
  if (!entry) {
    throw new ProblemNotInContestError(input.letter);
  }

  const submission = await createSubmission(db, {
    userId: input.userId,
    problemId: entry.problemId,
    contestId: contest.id,
    language: input.language,
    source: input.source,
  });

  // Higher priority than practice — the queue grows towards the end of a
  // contest, and a competitor must not wait behind training runs.
  await queue.enqueue({ submissionId: submission.id }, "contest");

  return { submissionId: submission.id };
}

export interface LeaderboardView {
  frozen: boolean;
  frozenFrom: Date | null;
  problems: { letter: string; slug: string; title: string }[];
  rows: (LeaderboardRow & { displayName: string; isOfficial: boolean })[];
}

/**
 * Ranking konkursu.
 *
 * For contestants it shows the pre-freeze state during the last
 * `freezeMinutes`; an admin gets the real one. After a manual unfreeze
 * everyone sees the same thing.
 */
export async function getLeaderboard(
  db: Database,
  contest: ContestRow,
  options: { isAdmin: boolean; now?: Date },
): Promise<LeaderboardView> {
  const now = options.now ?? new Date();
  const [contestProblemList, participants, allSubmissions] = await Promise.all([
    listContestProblems(db, contest.id),
    listParticipants(db, contest.id),
    loadScoredSubmissions(db, contest.id),
  ]);

  const frozenFrom = options.isAdmin
    ? null
    : freezeStart({ ...contest, unfrozen: contest.unfrozen });

  const { visible } = applyFreeze(allSubmissions, { frozenFrom });

  const rows = buildLeaderboard({
    rules: {
      startsAt: contest.startsAt,
      penaltyMinutes: contest.penaltyMinutes,
      compileErrorCountsAsAttempt: contest.compileErrorCountsAsAttempt,
    },
    // Unofficial entrants compete outside the ranking.
    participantIds: participants
      .filter((participant) => participant.isOfficial)
      .map((participant) => participant.userId),
    problemIds: contestProblemList.map((problem) => problem.problemId),
    submissions: visible,
  });

  const byId = new Map(participants.map((p) => [p.userId, p]));

  return {
    frozen: frozenFrom !== null && now.getTime() >= frozenFrom.getTime(),
    frozenFrom,
    problems: contestProblemList.map(({ letter, slug, title }) => ({
      letter,
      slug,
      title,
    })),
    rows: rows.map((row) => ({
      ...row,
      displayName: byId.get(row.participantId)?.displayName ?? "?",
      isOfficial: byId.get(row.participantId)?.isOfficial ?? true,
    })),
  };
}

/** The ranking as CSV — the format for announcing results outside the app. */
export function leaderboardToCsv(view: LeaderboardView): string {
  const header = [
    "rank",
    "participant",
    "solved",
    "penalty",
    ...view.problems.map((problem) => problem.letter),
  ];

  const lines = view.rows.map((row) => [
    String(row.rank),
    csvCell(row.displayName),
    String(row.solvedCount),
    String(row.totalPenalty),
    ...row.problems.map((problem) => {
      if (problem.solved) {
        return `+${problem.attempts > 0 ? problem.attempts : ""}/${problem.solvedAtMinute}`;
      }
      return problem.attempts > 0 ? `-${problem.attempts}` : "";
    }),
  ]);

  return [header, ...lines].map((row) => row.join(",")).join("\n");
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
