import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  clarifications,
  contestParticipants,
  contestProblems,
  contests,
  problems,
  submissions,
  users,
  type ClarificationRow,
  type ContestRow,
  type Database,
} from "@sfera/db";
import type { ScoredSubmission, Verdict } from "@sfera/shared";

export async function findContestBySlug(
  db: Database,
  slug: string,
): Promise<ContestRow | null> {
  const [contest] = await db
    .select()
    .from(contests)
    .where(eq(contests.slug, slug))
    .limit(1);
  return contest ?? null;
}

export async function listContests(
  db: Database,
  options: { includePrivate: boolean },
): Promise<ContestRow[]> {
  const query = db.select().from(contests).orderBy(asc(contests.startsAt));
  if (options.includePrivate) return query;
  return query.where(eq(contests.visibility, "PUBLIC"));
}

export interface ContestProblemEntry {
  problemId: string;
  slug: string;
  title: string;
  letter: string;
  position: number;
}

export async function listContestProblems(
  db: Database,
  contestId: string,
): Promise<ContestProblemEntry[]> {
  return db
    .select({
      problemId: problems.id,
      slug: problems.slug,
      title: problems.title,
      letter: contestProblems.letter,
      position: contestProblems.position,
    })
    .from(contestProblems)
    .innerJoin(problems, eq(problems.id, contestProblems.problemId))
    .where(eq(contestProblems.contestId, contestId))
    .orderBy(asc(contestProblems.position));
}

export class UnknownProblemError extends Error {
  constructor(readonly slugs: string[]) {
    super(`Nie ma zadań: ${slugs.join(", ")}`);
    this.name = "UnknownProblemError";
  }
}

/** Litery A, B, C… przydzielane wg kolejności na liście. */
function letterFor(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export async function setContestProblems(
  db: Database,
  contestId: string,
  problemSlugs: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(contestProblems).where(eq(contestProblems.contestId, contestId));

    if (problemSlugs.length === 0) return;

    const found = await tx
      .select({ id: problems.id, slug: problems.slug })
      .from(problems)
      .where(inArray(problems.slug, problemSlugs));

    const bySlug = new Map(found.map((row) => [row.slug, row.id]));
    const missing = problemSlugs.filter((slug) => !bySlug.has(slug));
    if (missing.length > 0) throw new UnknownProblemError(missing);

    await tx.insert(contestProblems).values(
      problemSlugs.map((slug, index) => ({
        contestId,
        problemId: bySlug.get(slug)!,
        letter: letterFor(index),
        position: index + 1,
      })),
    );
  });
}

export interface ParticipantEntry {
  userId: string;
  displayName: string;
  isOfficial: boolean;
}

export async function listParticipants(
  db: Database,
  contestId: string,
): Promise<ParticipantEntry[]> {
  return db
    .select({
      userId: contestParticipants.userId,
      displayName: contestParticipants.displayName,
      isOfficial: contestParticipants.isOfficial,
    })
    .from(contestParticipants)
    .where(eq(contestParticipants.contestId, contestId))
    .orderBy(asc(contestParticipants.displayName));
}

export async function isRegistered(
  db: Database,
  contestId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: contestParticipants.id })
    .from(contestParticipants)
    .where(
      and(
        eq(contestParticipants.contestId, contestId),
        eq(contestParticipants.userId, userId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export async function registerParticipant(
  db: Database,
  input: {
    contestId: string;
    userId: string;
    displayName: string;
    isOfficial: boolean;
  },
): Promise<void> {
  await db
    .insert(contestParticipants)
    .values(input)
    // Powtórna rejestracja nie jest błędem — po prostu nic nie zmienia.
    .onConflictDoNothing();
}

export async function removeParticipant(
  db: Database,
  contestId: string,
  userId: string,
): Promise<boolean> {
  const removed = await db
    .delete(contestParticipants)
    .where(
      and(
        eq(contestParticipants.contestId, contestId),
        eq(contestParticipants.userId, userId),
      ),
    )
    .returning({ id: contestParticipants.id });
  return removed.length > 0;
}

/**
 * Submity konkursowe w formacie, którego oczekuje scoring.
 *
 * Bierze tylko ocenione — `QUEUED`/`RUNNING` nie mają jeszcze werdyktu i nie
 * mogą wpływać na ranking.
 */
export async function loadScoredSubmissions(
  db: Database,
  contestId: string,
): Promise<ScoredSubmission[]> {
  const rows = await db
    .select({
      participantId: submissions.userId,
      problemId: submissions.problemId,
      verdict: submissions.verdict,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.contestId, contestId),
        isNotNull(submissions.verdict),
      ),
    )
    .orderBy(asc(submissions.createdAt));

  return rows.map((row) => ({
    participantId: row.participantId,
    problemId: row.problemId,
    verdict: row.verdict as Verdict,
    createdAt: row.createdAt,
  }));
}

// --- Clarifications ---

export interface ClarificationEntry extends ClarificationRow {
  problemLetter: string | null;
  askedByName: string | null;
}

export async function listClarifications(
  db: Database,
  contestId: string,
): Promise<ClarificationEntry[]> {
  const rows = await db
    .select({
      clarification: clarifications,
      problemLetter: contestProblems.letter,
      askedByName: users.displayName,
    })
    .from(clarifications)
    .leftJoin(
      contestProblems,
      and(
        eq(contestProblems.problemId, clarifications.problemId),
        eq(contestProblems.contestId, clarifications.contestId),
      ),
    )
    .leftJoin(users, eq(users.id, clarifications.askedBy))
    .where(eq(clarifications.contestId, contestId))
    .orderBy(asc(clarifications.createdAt));

  return rows.map((row) => ({
    ...row.clarification,
    problemLetter: row.problemLetter,
    askedByName: row.askedByName,
  }));
}

export async function insertClarification(
  db: Database,
  input: {
    contestId: string;
    problemId: string | null;
    askedBy: string | null;
    question: string;
    answer?: string | null;
    isPublic?: boolean;
  },
): Promise<ClarificationRow> {
  const [row] = await db
    .insert(clarifications)
    .values({
      ...input,
      answer: input.answer ?? null,
      isPublic: input.isPublic ?? false,
      answeredAt: input.answer ? new Date() : null,
    })
    .returning();
  return row!;
}

export async function answerClarification(
  db: Database,
  id: string,
  input: { answer: string; isPublic: boolean },
): Promise<ClarificationRow | null> {
  const [row] = await db
    .update(clarifications)
    .set({ ...input, answeredAt: new Date() })
    .where(eq(clarifications.id, id))
    .returning();
  return row ?? null;
}
