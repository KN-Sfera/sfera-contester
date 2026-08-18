"use client";

import { useEffect, useRef } from "react";
import type { Verdict } from "@sfera/shared";
import { cx } from "@/lib/cx";
import { formatMemory, formatTime } from "@/lib/format";
import { motion, prefersReducedMotion, set } from "@/lib/motion/motion";
import { verdictMeta } from "@/lib/verdict";
import { BalloonRelease } from "./balloon-release";

/**
 * The submission result.
 *
 * A permanent place on screen, not a transient message — the verdict is what
 * the contestant came for and it must not disappear after three seconds.
 *
 * Anything other than AC gets a short horizontal shake. It is the same
 * information the colour carries, delivered on a second channel — after a
 * failed submission the eye is often still in the editor.
 */

export interface VerdictBannerProps {
  slug: string;
  verdict: Verdict;
  failedTestOrdinal: number | null;
  total: number;
  maxTime: number | null;
  maxMemory: number | null;
  compileOutput?: string | null;
}

export function VerdictBanner({
  slug,
  verdict,
  failedTestOrdinal,
  total,
  maxTime,
  maxMemory,
  compileOutput,
}: VerdictBannerProps) {
  const meta = verdictMeta(verdict);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || meta.accepted || prefersReducedMotion()) return;

    set(node, { translateX: 0 });
    const handle = motion(node, {
      translateX: [
        { to: -3, duration: 60 },
        { to: 3, duration: 70 },
        { to: -2, duration: 70 },
        { to: 0, duration: 60 },
      ],
    });
    return () => handle.cancel();
  }, [verdict, meta.accepted]);

  return (
    <div className="relative overflow-hidden">
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        className={cx("border px-4 py-3.5 sm:px-5")}
        style={{
          borderColor: `color-mix(in srgb, ${meta.color} 45%, transparent)`,
          background: `color-mix(in srgb, ${meta.color} 8%, transparent)`,
        }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p
            className="font-[family-name:var(--font-display)] text-title leading-none"
            style={{ color: meta.color }}
          >
            {meta.code}
          </p>
          <p className="text-label text-ink-muted">
            {formatTime(maxTime)} · {formatMemory(maxMemory)}
          </p>
        </div>

        <p className="mt-2 text-small text-ink">
          {summary(verdict, failedTestOrdinal, total)}
        </p>

        {verdict === "CE" && compileOutput && (
          <pre className="mt-3 max-h-56 overflow-auto border border-rule bg-paper-sunken p-3 text-micro leading-relaxed whitespace-pre-wrap">
            {compileOutput}
          </pre>
        )}
      </div>

      {meta.accepted && <BalloonRelease key={verdict} slug={slug} />}
    </div>
  );
}

function summary(
  verdict: Verdict,
  failedTestOrdinal: number | null,
  total: number,
): string {
  if (verdict === "AC") {
    return total > 0
      ? `Accepted — ${total} of ${total} tests.`
      : "Accepted — every test passed.";
  }
  if (verdict === "CE") return verdictMeta(verdict).description;
  if (failedTestOrdinal !== null) {
    // The test number and the verdict are all a contestant gets. A hidden
    // test's input never leaves the server.
    return `${verdictMeta(verdict).label} on test ${failedTestOrdinal}${
      total > 0 ? ` of ${total}` : ""
    }.`;
  }
  return verdictMeta(verdict).description;
}
