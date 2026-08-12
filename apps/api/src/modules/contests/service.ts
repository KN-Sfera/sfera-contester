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
    super(`Nie ma konkursu ${slug}`);
    this.name = "ContestNotFoundError";
  }
}

export class NotRegisteredError extends Error {
  constructor() {
    super("Nie jesteś zapisany na ten konkurs");
    this.name = "NotRegisteredError";
  }
}

export class ContestNotRunningError extends Error {
  constructor(readonly phase: "UPCOMING" | "FINISHED") {
    super(
      phase === "UPCOMING"
        ? "Konkurs jeszcze się nie zaczął"
        : "Konkurs już się zakończył",
    );
    this.name = "ContestNotRunningError";
  }
}

export class ProblemNotInContestError extends Error {
  constructor(letter: string) {
    super(`Zadanie ${letter} nie należy do tego konkursu`);
    this.name = "ProblemNotInContestError";
  }
}

/**
 * Zadania konkursu widać dopiero po starcie.
 *
 * To nie kosmetyka: gdyby lista wyciekała wcześniej, zawodnicy mieliby czas na
 * przygotowanie przed sygnałem. Admin widzi je zawsze.
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
  /** Zegar liczony po stronie serwera — przeglądarka tylko wyświetla. */
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
 * Submit konkursowy. Poza zwykłą walidacją pilnuje trzech rzeczy: że zawodnik
 * jest zapisany, że konkurs właśnie trwa i że zadanie do niego należy.
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

  // Wyższy priorytet niż ćwiczenia — w końcówce konkursu kolejka rośnie,
  // a zawodnik na zawodach nie może czekać za treningiem.
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
 * Dla zawodników przez ostatnie `freezeMinutes` pokazuje stan sprzed zamrożenia;
 * admin dostaje prawdziwy. Po ręcznym odmrożeniu wszyscy widzą to samo.
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
    // Nieoficjalni startują poza rankingiem.
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

/** Ranking jako CSV — format do ogłaszania wyników poza aplikacją. */
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
