"use client";

import { useEffect, useState } from "react";
import { getSubmission } from "@/lib/api/submissions";
import type { SubmissionDetail } from "@/lib/api/types";
import { useSubmissionProgress } from "@/lib/sse/use-submission-progress";
import { useCountUp } from "@/lib/motion/use-count-up";
import { TestStrip } from "./test-strip";
import { VerdictBanner } from "./verdict-banner";

/**
 * Judging, live.
 *
 * The strip fills in step with SSE events, and once `done` arrives we pull the
 * submission details — times and memory come from the database, not the
 * stream, because the stream only carries what progress needs.
 */
export function LiveVerdict({
  submissionId,
  slug,
  onSettled,
}: {
  submissionId: string;
  slug: string;
  onSettled?: () => void;
}) {
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const progress = useSubmissionProgress(submissionId, detail === null);

  const settled = progress.verdict !== null || progress.error !== null;

  useEffect(() => {
    if (!settled) return;
    let cancelled = false;

    getSubmission(submissionId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch(() => {
        // The verdict is already on screen from the stream — missing details
        // cost us the timings, not the result.
      })
      .finally(() => {
        if (!cancelled) onSettled?.();
      });

    return () => {
      cancelled = true;
    };
  }, [settled, submissionId, onSettled]);

  const graded = progress.results.filter(Boolean).length;
  const shown = useCountUp(graded);

  if (progress.error) {
    return (
      <p role="alert" className="border border-rule-strong px-4 py-3 text-small">
        Judging failed: {progress.error}. This is a failure on our side — report
        it to the organiser.
      </p>
    );
  }

  const verdict = progress.verdict;
  const total = progress.total || detail?.results.length || 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="label">{verdict ? "Tests" : "Judging"}</span>
          <span className="text-micro tabular-nums text-ink-muted">
            {total > 0 ? `Test ${shown}/${total}` : "Waiting in the queue"}
          </span>
        </div>
        <TestStrip total={total} results={progress.results} />
      </div>

      {verdict && (
        <VerdictBanner
          slug={slug}
          verdict={verdict}
          failedTestOrdinal={detail?.failedTestOrdinal ?? failedFrom(progress.results)}
          total={total}
          maxTime={detail?.maxTime ?? null}
          maxMemory={detail?.maxMemory ?? null}
        />
      )}
    </div>
  );
}

/** The first failing test number — before the details arrive from the database. */
function failedFrom(results: readonly (string | undefined)[]): number | null {
  const index = results.findIndex((verdict) => verdict && verdict !== "AC");
  return index >= 0 ? index + 1 : null;
}
