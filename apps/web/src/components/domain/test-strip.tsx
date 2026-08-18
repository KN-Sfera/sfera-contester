"use client";

import { useEffect, useRef } from "react";
import type { Verdict } from "@sfera/shared";
import { cx } from "@/lib/cx";
import { DURATION, EASE, motion, set, stagger } from "@/lib/motion/motion";
import { verdictMeta } from "@/lib/verdict";

/**
 * The test strip.
 *
 * Judging progress is not a percentage bar but a row of cells — one per test.
 * A percentage says "62%"; the strip says how many tests are left, which one
 * it died on, and whether the failure came immediately or at the very end.
 * That is real information, not decoration.
 *
 * ICPC rule: judging stops at the first failure, so the strip halts with one
 * cell in the verdict colour and the rest left empty.
 */

export interface TestStripProps {
  total: number;
  /** Verdicts of successive tests, indexed from 0 (test 1 = index 0). */
  results: readonly (Verdict | undefined)[];
  className?: string;
}

export function TestStrip({ total, results, className }: TestStripProps) {
  const container = useRef<HTMLDivElement>(null);
  const animatedTo = useRef(0);

  useEffect(() => {
    const node = container.current;
    if (!node) return;

    const cells = node.querySelectorAll<HTMLElement>("[data-cell]");
    const filled = results.length;

    // Only cells that arrived since the last render are animated. Without
    // this, every SSE event would replay the whole strip.
    const fresh: HTMLElement[] = [];
    for (let i = animatedTo.current; i < filled; i += 1) {
      const cell = cells[i];
      if (cell) fresh.push(cell);
    }
    animatedTo.current = filled;
    if (fresh.length === 0) return;

    set(fresh, { scale: 0.6, opacity: 0 });
    motion(fresh, {
      scale: 1,
      opacity: 1,
      duration: DURATION.fast,
      ease: EASE.out,
      // 90 ms per cell — slow enough to see which one just landed.
      delay: stagger(90),
    });

    // Deliberately no cancellation on cleanup. The effect runs twice
    // (StrictMode, re-render) and `animatedTo` already counts these cells as
    // shown — cutting the animation would leave them transparent forever. The
    // next event concerns different cells anyway, so there is nothing to cut.
  }, [results]);

  const cells = Array.from({ length: Math.max(total, results.length) });

  return (
    <div
      ref={container}
      className={cx("flex flex-wrap gap-[3px]", className)}
      role="img"
      aria-label={describe(total, results)}
    >
      {cells.map((_, index) => {
        const verdict = results[index];
        const meta = verdict ? verdictMeta(verdict) : null;

        return (
          <span
            key={index}
            data-cell
            title={verdict ? `Test ${index + 1}: ${verdict}` : `Test ${index + 1}`}
            className="h-4 w-2.5 border"
            style={{
              background: meta ? meta.color : "transparent",
              borderColor: meta ? meta.color : "var(--rule)",
            }}
          />
        );
      })}
    </div>
  );
}

/** The strip in words — a screen reader will not see the cells. */
function describe(total: number, results: readonly (Verdict | undefined)[]): string {
  const done = results.length;
  const failed = results.findIndex((verdict) => verdict && verdict !== "AC");

  if (failed >= 0) {
    return `Judging stopped at test ${failed + 1} of ${total}: ${results[failed]}.`;
  }
  if (done === 0) return `No tests judged out of ${total}.`;
  if (done >= total) return `All ${total} tests passed.`;
  return `${done} of ${total} tests passed.`;
}
