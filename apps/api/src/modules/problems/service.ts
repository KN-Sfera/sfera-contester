import type { Database } from "@sfera/db";
import type { Problem, ProblemSummary, ProblemTestCase } from "@sfera/shared";
import { findPublicProblemBySlug, listPublicProblems } from "./repository.js";

/**
 * Kształt zadania widoczny dla zawodnika. Świadomie nie zawiera ukrytych testów —
 * to jedyna projekcja, jakiej wolno używać warstwie HTTP. Routes nie sięgają do
 * repozytorium bezpośrednio, żeby nie dało się tego filtra ominąć.
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
 * Sample do uruchomienia w playgroundzie. Ukryte testy trafią do oceniania
 * dopiero w workerze (Faza 1.4), który nie odsyła ich treści do przeglądarki.
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
