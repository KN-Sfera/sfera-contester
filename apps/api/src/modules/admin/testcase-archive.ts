import { unzipSync } from "fflate";
import type { TestCaseInput } from "./problems.repository.js";

export class InvalidArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidArchiveError";
  }
}

const decoder = new TextDecoder("utf-8", { fatal: false });

/** Ile pierwszych par traktujemy jako sample, gdy paczka tego nie określa. */
export const DEFAULT_SAMPLE_COUNT = 1;

interface ArchiveEntry {
  base: string;
  kind: "in" | "out";
  content: string;
}

/**
 * Rozpakowuje paczkę testów w konwencji ICPC: pary `1.in`/`1.out`.
 *
 * Akceptuje też `.txt` i `.ans` (spotykane w archiwach), katalogi i zagnieżdżenia —
 * liczy się sama nazwa pliku. Sortowanie jest naturalne, żeby `10.in` nie lądowało
 * między `1.in` a `2.in`.
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
      `Nie udało się odczytać archiwum: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const entries: ArchiveEntry[] = [];

  for (const [path, content] of Object.entries(files)) {
    // Katalogi i śmieci systemowe.
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
      "Archiwum nie zawiera plików .in/.out (ani .txt/.ans)",
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
      `Brakuje plików z oczekiwanym wyjściem dla: ${naturalSort(orphans)
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

/** `2.in` przed `10.in` — porównanie leksykalne dałoby odwrotnie. */
function naturalSort(values: string[]): string[] {
  return [...values].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
}
