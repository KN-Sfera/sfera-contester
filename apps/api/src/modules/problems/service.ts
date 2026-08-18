import type { Database } from "@sfera/db";
import type { Problem, ProblemSummary, ProblemTestCase } from "@sfera/shared";
import { findPublicProblemBySlug, listPublicProblems } from "./repository.js";

/**
 * The shape of a problem a contestant sees. It deliberately excludes hidden
 * tests — this is the only projection the HTTP layer may use. Routes never reach
 * into the repository directly, so the filter cannot be bypassed.
 */
export interface PublicProblem {
  slug: string;
  title: string;
  statement: string;
  timeLimit: number;
  memoryLimit: number;
  testCases: ProblemTestCase[];
}

export function listProblems(db: Database): Promise<ProblemSummary[]> {
  return listPublicProblems(db);
}

export async function getPublicProblem(
  db: Database,
  slug: string,
): Promise<PublicProblem | null> {
  const problem = await findPublicProblemBySlug(db, slug);
  if (!problem) return null;

  return {
    slug: problem.slug,
    title: problem.title,
    statement: problem.statement,
    timeLimit: problem.timeLimit,
    memoryLimit: problem.memoryLimit,
    testCases: problem.testCases.filter((testCase) => testCase.isSample),
  };
}

export interface LoadedSampleCases {
  problem: Problem;
  samples: ProblemTestCase[];
}

/**
 * Samples for a playground run. Hidden tests reach judging only in the worker
 * (Phase 1.4), which never sends their contents back to the browser.
 */
export async function getSampleTestCases(
  db: Database,
  slug: string,
): Promise<LoadedSampleCases | null> {
  const problem = await findPublicProblemBySlug(db, slug);
  if (!problem) return null;

  return {
    problem,
    samples: problem.testCases.filter((testCase) => testCase.isSample),
  };
}
