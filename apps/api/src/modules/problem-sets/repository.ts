import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  problemSetItems,
  problemSets,
  problems,
  submissions,
  type Database,
  type ProblemSetRow,
} from "@sfera/db";

export interface ProblemSetSummary {
  slug: string;
  title: string;
  description: string;
  problemCount: number;
  /** How many problems in the set the user has solved. `null` when signed out. */
  solvedCount: number | null;
}

/**
 * Publicly visible sets, with the user's progress.
 *
 * It counts **published** problems only — a draft inside a set must not inflate
 * the denominator with something a contestant cannot see.
 */
export async function listPublicProblemSets(
  db: Database,
  userId: string | null,
): Promise<ProblemSetSummary[]> {
  const memberships = await db
    .select({
      slug: problemSets.slug,
      title: problemSets.title,
      description: problemSets.description,
      problemId: problems.id,
    })
    .from(problemSets)
    .leftJoin(problemSetItems, eq(problemSetItems.setId, problemSets.id))
    .leftJoin(
      problems,
      and(
        eq(problems.id, problemSetItems.problemId),
        eq(problems.isPublic, true),
      ),
    )
    .where(eq(problemSets.isPublic, true))
    .orderBy(asc(problemSets.title));

  const solved = await solvedProblemIds(
    db,
    userId,
    memberships
      .map((row) => row.problemId)
      .filter((id): id is string => id !== null),
  );

  const summaries = new Map<string, ProblemSetSummary>();
  for (const row of memberships) {
    const existing =
      summaries.get(row.slug) ??
      ({
        slug: row.slug,
        title: row.title,
        description: row.description,
        problemCount: 0,
        solvedCount: userId ? 0 : null,
      } satisfies ProblemSetSummary);

    if (row.problemId) {
      existing.problemCount += 1;
      if (userId && solved.has(row.problemId)) {
        existing.solvedCount = (existing.solvedCount ?? 0) + 1;
      }
    }
    summaries.set(row.slug, existing);
  }

  return [...summaries.values()];
}

export interface ProblemSetDetail {
  slug: string;
  title: string;
  description: string;
  problems: {
    slug: string;
    title: string;
    position: number;
    solved: boolean;
  }[];
}

export async function findPublicProblemSet(
  db: Database,
  slug: string,
  userId: string | null,
): Promise<ProblemSetDetail | null> {
  const [set] = await db
    .select()
    .from(problemSets)
    .where(and(eq(problemSets.slug, slug), eq(problemSets.isPublic, true)))
    .limit(1);

  if (!set) return null;

  const items = await db
    .select({
      slug: problems.slug,
      title: problems.title,
      position: problemSetItems.position,
      problemId: problems.id,
    })
    .from(problemSetItems)
    .innerJoin(problems, eq(problems.id, problemSetItems.problemId))
    .where(
      and(eq(problemSetItems.setId, set.id), eq(problems.isPublic, true)),
    )
    .orderBy(asc(problemSetItems.position));

  const solved = await solvedProblemIds(
    db,
    userId,
    items.map((item) => item.problemId),
  );

  return {
    slug: set.slug,
    title: set.title,
    description: set.description,
    problems: items.map(({ problemId, ...item }) => ({
      ...item,
      solved: solved.has(problemId),
    })),
  };
}

async function solvedProblemIds(
  db: Database,
  userId: string | null,
  problemIds: string[],
): Promise<Set<string>> {
  if (!userId || problemIds.length === 0) return new Set();

  const rows = await db
    .selectDistinct({ problemId: submissions.problemId })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        eq(submissions.verdict, "AC"),
        inArray(submissions.problemId, problemIds),
      ),
    );

  return new Set(rows.map((row) => row.problemId));
}

// --- Operacje admina ---

export async function listAllProblemSets(
  db: Database,
): Promise<(ProblemSetRow & { problemCount: number })[]> {
  return db
    .select({
      id: problemSets.id,
      slug: problemSets.slug,
      title: problemSets.title,
      description: problemSets.description,
      isPublic: problemSets.isPublic,
      createdBy: problemSets.createdBy,
      createdAt: problemSets.createdAt,
      updatedAt: problemSets.updatedAt,
      problemCount: sql<number>`count(${problemSetItems.id})::int`,
    })
    .from(problemSets)
    .leftJoin(problemSetItems, eq(problemSetItems.setId, problemSets.id))
    .groupBy(problemSets.id)
    .orderBy(asc(problemSets.title));
}

export async function findProblemSetBySlug(
  db: Database,
  slug: string,
): Promise<ProblemSetRow | null> {
  const [set] = await db
    .select()
    .from(problemSets)
    .where(eq(problemSets.slug, slug))
    .limit(1);
  return set ?? null;
}

export async function insertProblemSet(
  db: Database,
  input: {
    slug: string;
    title: string;
    description: string;
    createdBy: string;
  },
): Promise<ProblemSetRow> {
  const [set] = await db
    .insert(problemSets)
    .values({ ...input, isPublic: false })
    .returning();
  return set!;
}

export async function updateProblemSet(
  db: Database,
  slug: string,
  input: { title?: string; description?: string; isPublic?: boolean },
): Promise<ProblemSetRow | null> {
  const [set] = await db
    .update(problemSets)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(problemSets.slug, slug))
    .returning();
  return set ?? null;
}

export async function deleteProblemSet(
  db: Database,
  slug: string,
): Promise<boolean> {
  const deleted = await db
    .delete(problemSets)
    .where(eq(problemSets.slug, slug))
    .returning({ id: problemSets.id });
  return deleted.length > 0;
}

export class DuplicateProblemError extends Error {
  constructor(readonly slugs: string[]) {
    super(`Problems repeat within the set: ${slugs.join(", ")}`);
    this.name = "DuplicateProblemError";
  }
}

export class UnknownProblemError extends Error {
  constructor(readonly slugs: string[]) {
    super(`No such problems: ${slugs.join(", ")}`);
    this.name = "UnknownProblemError";
  }
}

/**
 * Sets a set's contents from a list of slugs. Positions follow the order.
 *
 * The swap runs in a transaction together with deleting the old rows —
 * otherwise the unique index on `(set_id, position)` would blow up on a
 * reorder.
 */
export async function setProblemSetItems(
  db: Database,
  setId: string,
  problemSlugs: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(problemSetItems).where(eq(problemSetItems.setId, setId));

    if (problemSlugs.length === 0) return;

    const duplicates = problemSlugs.filter(
      (slug, index) => problemSlugs.indexOf(slug) !== index,
    );
    if (duplicates.length > 0) {
      throw new DuplicateProblemError([...new Set(duplicates)]);
    }

    const found = await tx
      .select({ id: problems.id, slug: problems.slug })
      .from(problems)
      .where(inArray(problems.slug, problemSlugs));

    const bySlug = new Map(found.map((row) => [row.slug, row.id]));
    const missing = problemSlugs.filter((slug) => !bySlug.has(slug));
    if (missing.length > 0) {
      throw new UnknownProblemError(missing);
    }

    await tx.insert(problemSetItems).values(
      problemSlugs.map((slug, index) => ({
        setId,
        problemId: bySlug.get(slug)!,
        position: index + 1,
      })),
    );

    await tx
      .update(problemSets)
      .set({ updatedAt: new Date() })
      .where(eq(problemSets.id, setId));
  });
}
