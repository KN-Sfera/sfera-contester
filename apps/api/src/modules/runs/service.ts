import type { Database } from "@sfera/db";
import type { Judge0Client } from "@sfera/judge0";
import type {
  LanguageId,
  RunResult,
  RunSamplesResult,
  SampleRunCaseResult,
  Verdict,
} from "@sfera/shared";
import { getSampleTestCases } from "../problems/service.js";

export class ProblemNotFoundError extends Error {
  constructor(slug: string) {
    super(`Problem or samples not found: ${slug}`);
    this.name = "ProblemNotFoundError";
  }
}

export interface RunOnceInput {
  language: LanguageId;
  source: string;
  stdin?: string;
  expectedStdout?: string;
  cpuTimeLimit?: number;
  memoryLimit?: number;
}

export function runOnce(
  judge0: Judge0Client,
  input: RunOnceInput,
): Promise<RunResult> {
  return judge0.execute(input);
}

export interface RunSamplesInput {
  language: LanguageId;
  source: string;
  problemSlug: string;
}

/**
 * Przerywa na pierwszym niezaliczonym teście — tak samo zachowa się worker
 * oceniający submity w Fazie 1.4 (reguła ICPC: liczy się pierwszy błąd).
 */
export async function runSamples(
  db: Database,
  judge0: Judge0Client,
  input: RunSamplesInput,
): Promise<RunSamplesResult> {
  const loaded = await getSampleTestCases(db, input.problemSlug);
  if (!loaded || loaded.samples.length === 0) {
    throw new ProblemNotFoundError(input.problemSlug);
  }

  const results: SampleRunCaseResult[] = [];
  let overall: Verdict = "AC";

  for (const testCase of loaded.samples) {
    const result = await judge0.execute({
      language: input.language,
      source: input.source,
      stdin: testCase.input,
      expectedStdout: testCase.expectedOutput,
      cpuTimeLimit: loaded.problem.timeLimit,
      memoryLimit: loaded.problem.memoryLimit,
    });

    results.push({
      ordinal: testCase.ordinal,
      verdict: result.verdict,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      compileOutput: result.compileOutput,
      time: result.time,
      memory: result.memory,
    });

    if (result.verdict !== "AC") {
      overall = result.verdict === "OK" ? "WA" : result.verdict;
      break;
    }
  }

  return {
    problemSlug: input.problemSlug,
    verdict: overall,
    results,
  };
}
