import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AA, contrastRatio, parseColor, type Rgb } from "@/lib/contrast";

/**
 * Token contrast, measured against the real `globals.css`.
 *
 * The test **parses the stylesheet** instead of restating the values. A copy
 * would drift on the first palette correction and stop protecting anything —
 * and this is the only thing making sure a verdict stays readable in both
 * themes.
 */

/**
 * A list of candidates rather than one path: the working directory depends on
 * whether the tests were started from the monorepo root or from `apps/web`.
 * Importing with `?raw` is out — Vitest strips CSS by default and would hand
 * back an empty string, so the test would pass while checking nothing.
 */
const CANDIDATES = ["src/app/globals.css", "apps/web/src/app/globals.css"];

function loadStylesheet(): string {
  for (const candidate of CANDIDATES) {
    const path = resolve(candidate);
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  throw new Error(`globals.css not found. Tried: ${CANDIDATES.join(", ")}`);
}

const css = loadStylesheet();

/** Pulls `--name: value` declarations out of the block with a given selector. */
function readTokens(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No ${selector} block in globals.css`);

  const open = css.indexOf("{", start);
  const end = css.indexOf("\n}", open);
  const body = css.slice(open + 1, end);

  const tokens = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(match[1]!, match[2]!.trim());
  }
  return tokens;
}

const dark = readTokens(":root");
const light = new Map([...dark, ...readTokens('[data-theme="light"]')]);

const THEMES = [
  { name: "dark", tokens: dark },
  { name: "light", tokens: light },
] as const;

function color(tokens: Map<string, string>, name: string): Rgb {
  const raw = tokens.get(name);
  expect(raw, `missing token ${name}`).toBeDefined();
  const parsed = parseColor(raw!);
  expect(parsed, `cannot read ${name}: ${raw}`).not.toBeNull();
  return parsed!;
}

function ratio(tokens: Map<string, string>, fg: string, bg: string): number {
  return contrastRatio(color(tokens, fg), color(tokens, bg));
}

describe.each(THEMES)("contrast — $name theme", ({ tokens }) => {
  const SURFACES = ["--paper", "--paper-raised", "--paper-sunken"];

  it.each(SURFACES)("body text on %s meets AA", (surface) => {
    expect(ratio(tokens, "--ink", surface)).toBeGreaterThanOrEqual(AA.text);
  });

  it.each(SURFACES)("secondary text on %s meets AA", (surface) => {
    // `--ink-muted` carries column headers and submission metadata. That is
    // content, not decoration, so the full text threshold applies.
    expect(ratio(tokens, "--ink-muted", surface)).toBeGreaterThanOrEqual(AA.text);
  });

  it("the faintest text meets the large-text threshold", () => {
    // `--ink-faint` is used only on `label-micro` small caps and on dimmed
    // states — never on content anyone has to read.
    expect(ratio(tokens, "--ink-faint", "--paper")).toBeGreaterThanOrEqual(AA.large);
  });

  const VERDICTS = ["--v-ac", "--v-wa", "--v-tle", "--v-mle", "--v-re", "--v-ce"];

  it.each(VERDICTS)("verdict %s is readable on paper", (verdict) => {
    // A verdict abbreviation is the most important three characters on screen.
    expect(ratio(tokens, verdict, "--paper")).toBeGreaterThanOrEqual(AA.text);
  });

  it("the reversed-out button is readable", () => {
    // The primary variant: filled with ink, set in the paper colour.
    expect(ratio(tokens, "--paper", "--ink")).toBeGreaterThanOrEqual(AA.text);
  });

  it("a control boundary is visible against its background", () => {
    // Field and table borders are non-text elements — the 3:1 threshold.
    // Measured after compositing, because `--rule` is translucent.
    expect(ratio(tokens, "--rule-strong", "--paper")).toBeGreaterThanOrEqual(AA.large);
  });

  it.each([
    ["--balloon-0", "red"],
    ["--balloon-2", "yellow"],
    ["--balloon-11", "grey"],
  ])("balloon %s (%s) stands out from the paper", (balloon) => {
    // Balloons are non-text elements, but they have to be distinguishable
    // from the background — otherwise the progress column shows nothing.
    expect(ratio(tokens, balloon, "--paper")).toBeGreaterThanOrEqual(AA.large);
  });
});
