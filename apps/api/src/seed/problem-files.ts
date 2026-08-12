import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * Format seedowy z `data/problems/`. Nie jest już źródłem prawdy w runtime —
 * służy tylko do zasilenia bazy i do wymiany zadań poza aplikacją.
 */
export const problemFileSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "slug: tylko małe litery, cyfry i myślniki"),
  title: z.string().min(1).max(200),
  statement: z.string().min(1),
  timeLimit: z.number().positive().max(60),
  memoryLimit: z.number().int().positive(),
  testCases: z
    .array(
      z.object({
        input: z.string(),
        expectedOutput: z.string(),
        isSample: z.boolean().default(false),
      }),
    )
    .min(1),
});

export type ProblemFile = z.infer<typeof problemFileSchema>;

export function resolveProblemsDir(explicit?: string): string {
  const candidates = [
    explicit,
    join(process.cwd(), "data", "problems"),
    join(process.cwd(), "..", "..", "data", "problems"),
    // dist/seed → korzeń repo
    join(moduleDir, "..", "..", "..", "..", "data", "problems"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      readdirSync(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error("Nie znaleziono katalogu data/problems");
}

export function readProblemFiles(dir: string): ProblemFile[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const raw: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
      const parsed = problemFileSchema.safeParse(raw);
      if (!parsed.success) {
        const details = JSON.stringify(parsed.error.flatten(), null, 2);
        throw new Error(`Niepoprawny plik zadania ${name}:\n${details}`);
      }
      return parsed.data;
    });
}
