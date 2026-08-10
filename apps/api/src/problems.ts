import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Problem, ProblemSummary } from "@sfera/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));

function problemsDir(): string {
  const candidates = [
    process.env.PROBLEMS_DIR,
    join(process.cwd(), "data", "problems"),
    join(process.cwd(), "..", "..", "data", "problems"),
    join(__dirname, "..", "..", "..", "data", "problems"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      readdirSync(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error("Could not locate data/problems directory");
}

export function listProblems(): ProblemSummary[] {
  const dir = problemsDir();
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const problem = JSON.parse(
        readFileSync(join(dir, name), "utf8"),
      ) as Problem;
      return {
        slug: problem.slug,
        title: problem.title,
        statement: problem.statement,
        timeLimit: problem.timeLimit,
        memoryLimit: problem.memoryLimit,
        sampleCount: problem.testCases.filter((tc) => tc.isSample).length,
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getProblem(slug: string): Problem | null {
  const dir = problemsDir();
  try {
    const problem = JSON.parse(
      readFileSync(join(dir, `${slug}.json`), "utf8"),
    ) as Problem;
    return problem;
  } catch {
    return null;
  }
}

export function getSampleCases(slug: string) {
  const problem = getProblem(slug);
  if (!problem) return null;
  return {
    problem,
    samples: problem.testCases.filter((tc) => tc.isSample),
  };
}
