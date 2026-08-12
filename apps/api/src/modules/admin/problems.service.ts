import type { Database } from "@sfera/db";
import type { Verdict } from "@sfera/shared";
import type { Judge0Client } from "@sfera/judge0";
import type { LanguageId } from "@sfera/shared";
import {
  findProblemForAdmin,
  setProblemPublished,
  type AdminProblemDetail,
} from "./problems.repository.js";

export class ProblemNotFoundError extends Error {
  constructor(slug: string) {
    super(`Nie ma zadania ${slug}`);
    this.name = "ProblemNotFoundError";
  }
}

export class NoTestCasesError extends Error {
  constructor(slug: string) {
    super(`Zadanie ${slug} nie ma żadnych testów`);
    this.name = "NoTestCasesError";
  }
}

export interface ReferenceCaseResult {
  ordinal: number;
  verdict: Verdict;
  isSample: boolean;
  /** Wypełniane tylko dla testów, które nie przeszły — admin musi wiedzieć, co poprawić. */
  expectedOutput?: string;
  actualOutput?: string;
  stderr?: string;
  compileOutput?: string;
}

export interface ReferenceRunResult {
  passed: boolean;
  results: ReferenceCaseResult[];
}

/**
 * Przepuszcza wzorcowe rozwiązanie przez **wszystkie** testy zadania.
 *
 * W przeciwieństwie do oceniania submitów nie przerywa na pierwszym błędzie —
 * admin chce zobaczyć komplet problemów naraz, a nie poprawiać je po jednym.
 */
export async function runReferenceSolution(
  db: Database,
  judge0: Judge0Client,
  slug: string,
  solution: { language: LanguageId; source: string },
): Promise<ReferenceRunResult> {
  const problem = await loadProblem(db, slug);

  const results: ReferenceCaseResult[] = [];

  for (const testCase of problem.testCases) {
    const run = await judge0.execute({
      language: solution.language,
      source: solution.source,
      stdin: testCase.input,
      expectedStdout: testCase.expectedOutput,
      cpuTimeLimit: problem.timeLimit,
      memoryLimit: problem.memoryLimit,
    });

    const verdict = run.verdict === "OK" ? "WA" : run.verdict;

    results.push(
      verdict === "AC"
        ? { ordinal: testCase.ordinal, verdict, isSample: testCase.isSample }
        : {
            ordinal: testCase.ordinal,
            verdict,
            isSample: testCase.isSample,
            expectedOutput: testCase.expectedOutput,
            actualOutput: run.stdout,
            stderr: run.stderr,
            compileOutput: run.compileOutput,
          },
    );
  }

  return {
    passed: results.every((result) => result.verdict === "AC"),
    results,
  };
}

export class ReferenceSolutionFailedError extends Error {
  constructor(readonly run: ReferenceRunResult) {
    super("Wzorcowe rozwiązanie nie przechodzi wszystkich testów");
    this.name = "ReferenceSolutionFailedError";
  }
}

/**
 * Publikuje zadanie, ale dopiero po sprawdzeniu wzorcówki.
 *
 * Walidacja jest robiona **w momencie publikacji**, a nie zapamiętywana jako
 * flaga w bazie. Zapamiętana zdezaktualizowałaby się po każdej edycji testów,
 * a najczęstszy błąd przy zakładaniu zadania to właśnie złe `expected_output`.
 */
export async function publishProblem(
  db: Database,
  judge0: Judge0Client,
  slug: string,
  solution: { language: LanguageId; source: string },
): Promise<ReferenceRunResult> {
  const run = await runReferenceSolution(db, judge0, slug, solution);
  if (!run.passed) {
    throw new ReferenceSolutionFailedError(run);
  }

  await setProblemPublished(db, slug, true);
  return run;
}

export async function unpublishProblem(
  db: Database,
  slug: string,
): Promise<void> {
  const updated = await setProblemPublished(db, slug, false);
  if (!updated) throw new ProblemNotFoundError(slug);
}

async function loadProblem(
  db: Database,
  slug: string,
): Promise<AdminProblemDetail> {
  const problem = await findProblemForAdmin(db, slug);
  if (!problem) throw new ProblemNotFoundError(slug);
  if (problem.testCases.length === 0) throw new NoTestCasesError(slug);
  return problem;
}
