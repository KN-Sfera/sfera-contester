import type { ProblemSummary, ProblemTestCase } from "@sfera/shared";
import { apiFetch } from "./client";

/**
 * A problem as a contestant sees it. `testCases` holds **samples only** —
 * hidden tests are filtered out in the API repository and never leave the
 * server. There is nothing here for the frontend to filter, and it does not try.
 */
export interface PublicProblem {
  slug: string;
  title: string;
  statement: string;
  timeLimit: number;
  memoryLimit: number;
  testCases: ProblemTestCase[];
}

/**
 * Short revalidation rather than a full cache: the problem list rarely
 * changes, but a newly published problem should appear without waiting for a
 * deploy.
 */
const PUBLIC_CACHE = { next: { revalidate: 30 } } as const;

export function listProblems(): Promise<ProblemSummary[]> {
  return apiFetch<ProblemSummary[]>("/api/problems", PUBLIC_CACHE);
}

export function getProblem(slug: string): Promise<PublicProblem> {
  return apiFetch<PublicProblem>(
    `/api/problems/${encodeURIComponent(slug)}`,
    PUBLIC_CACHE,
  );
}
