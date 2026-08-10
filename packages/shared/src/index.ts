export const LANGUAGES = [
  {
    id: "c",
    label: "C (GCC)",
    monaco: "c",
    judge0Id: 50,
  },
  {
    id: "cpp",
    label: "C++ (G++)",
    monaco: "cpp",
    judge0Id: 54,
  },
  {
    id: "clang",
    label: "C (Clang)",
    monaco: "c",
    judge0Id: 75,
  },
  {
    id: "clangpp",
    label: "C++ (Clang++)",
    monaco: "cpp",
    judge0Id: 76,
  },
  {
    id: "python",
    label: "Python 3",
    monaco: "python",
    judge0Id: 71,
  },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

export type Verdict =
  | "OK"
  | "ACC"
  | "WA"
  | "CE"
  | "RE"
  | "TLE"
  | "MLE"
  | "SE";

export interface RunRequest {
  language: LanguageId;
  source: string;
  stdin?: string;
  expectedStdout?: string;
  cpuTimeLimit?: number;
  memoryLimit?: number;
}

export interface RunResult {
  verdict: Verdict;
  status: string;
  stdout: string;
  stderr: string;
  compileOutput: string;
  time: string | null;
  memory: number | null;
  exitCode: number | null;
  message: string | null;
}

export interface ProblemTestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isSample: boolean;
}

export interface Problem {
  slug: string;
  title: string;
  statement: string;
  timeLimit: number;
  memoryLimit: number;
  testCases: ProblemTestCase[];
}

export interface ProblemSummary {
  slug: string;
  title: string;
  statement: string;
  timeLimit: number;
  memoryLimit: number;
  sampleCount: number;
}

export interface SampleRunCaseResult {
  testCaseId: string;
  verdict: Verdict;
  status: string;
  stdout: string;
  stderr: string;
  compileOutput: string;
  time: string | null;
  memory: number | null;
}

export interface RunSamplesRequest {
  language: LanguageId;
  source: string;
  problemSlug: string;
}

export interface RunSamplesResult {
  problemSlug: string;
  verdict: Verdict;
  results: SampleRunCaseResult[];
}

export const MAX_SOURCE_BYTES = 64 * 1024;
export const MAX_STDIN_BYTES = 64 * 1024;
export const MAX_EXPECTED_BYTES = 64 * 1024;

export function normalizeOutput(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n+$/g, "");
}

export function compareOutputs(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}

export function getLanguage(id: string) {
  return LANGUAGES.find((language) => language.id === id);
}
