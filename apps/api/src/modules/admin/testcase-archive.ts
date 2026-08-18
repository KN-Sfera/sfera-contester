import { unzipSync } from "fflate";
import type { TestCaseInput } from "./problems.repository.js";

export class InvalidArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidArchiveError";
  }
}

const decoder = new TextDecoder("utf-8", { fatal: false });

/** How many leading pairs count as samples when the archive does not say. */
export const DEFAULT_SAMPLE_COUNT = 1;

interface ArchiveEntry {
  base: string;
  kind: "in" | "out";
  content: string;
}

/**
 * Unpacks a test archive in the ICPC convention: `1.in`/`1.out` pairs.
 *
 * It also accepts `.txt` and `.ans` (common in archives), directories and
 * nesting — only the file name matters. Sorting is natural, so that `10.in`
 * does not land between `1.in` and `2.in`.
 */
export function parseTestCaseArchive(
  archive: Uint8Array,
  options: { sampleCount?: number } = {},
): TestCaseInput[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(archive);
  } catch (error) {
    throw new InvalidArchiveError(
      `Could not read the archive: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const entries: ArchiveEntry[] = [];

  for (const [path, content] of Object.entries(files)) {
    // Directories and system clutter.
    if (path.endsWith("/") || path.includes("__MACOSX")) continue;

    const name = path.split("/").pop() ?? path;
    if (name.startsWith(".")) continue;

    const match = /^(.+)\.(in|out|txt|ans)$/i.exec(name);
    if (!match) continue;

    const [, base, rawExt] = match;
    const ext = rawExt!.toLowerCase();
    entries.push({
      base: base!,
      kind: ext === "in" || ext === "txt" ? "in" : "out",
      content: decoder.decode(content),
    });
  }

  if (entries.length === 0) {
    throw new InvalidArchiveError(
      "The archive contains no .in/.out files (nor .txt/.ans)",
    );
  }

  const inputs = new Map<string, string>();
  const outputs = new Map<string, string>();
  for (const entry of entries) {
    (entry.kind === "in" ? inputs : outputs).set(entry.base, entry.content);
  }

  const orphans = [...inputs.keys()].filter((base) => !outputs.has(base));
  if (orphans.length > 0) {
    throw new InvalidArchiveError(
      `Missing expected-output files for: ${naturalSort(orphans)
        .slice(0, 10)
        .join(", ")}`,
    );
  }

  const bases = naturalSort([...inputs.keys()]);
  const sampleCount = options.sampleCount ?? DEFAULT_SAMPLE_COUNT;

  return bases.map((base, index) => ({
    input: inputs.get(base)!,
    expectedOutput: outputs.get(base)!,
    isSample: index < sampleCount,
  }));
}

/** `2.in` before `10.in` — a lexical comparison would order them the other way. */
function naturalSort(values: string[]): string[] {
  return [...values].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
}
