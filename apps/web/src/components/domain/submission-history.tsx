"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getLanguage } from "@sfera/shared";
import { Balloon } from "@/components/ui/balloon";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { VerdictBadge } from "@/components/ui/verdict-badge";
import { listSubmissions } from "@/lib/api/submissions";
import type { SubmissionSummary } from "@/lib/api/types";
import { formatMemory, formatRelative, formatTime } from "@/lib/format";
import { isPending } from "@/lib/verdict";

/**
 * Submission history.
 *
 * A table on the desktop, a list of cards on a phone — horizontal scrolling
 * through a table at 375 px is worse than having no table.
 *
 * Submissions still being judged are refreshed by polling, not by a stream:
 * one SSE connection per row means as many open connections as there are rows.
 * Test-by-test progress lives on the submission page; here the verdict is enough.
 */

const POLL_MS = 4000;

export function SubmissionHistory() {
  const [submissions, setSubmissions] = useState<SubmissionSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const load = async () => {
      try {
        const result = await listSubmissions();
        if (cancelled) return;
        setSubmissions(result ?? []);
        setFailed(false);

        // Keep polling only while something is still being judged.
        if ((result ?? []).some((item) => isPending(item.status))) {
          timer = window.setTimeout(load, POLL_MS);
        }
      } catch {
        if (cancelled) return;
        setSubmissions([]);
        setFailed(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (submissions === null) {
    return (
      <div className="mt-6" aria-busy="true">
        <SkeletonRows rows={6} />
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mt-8">
        <EmptyState
          title="Could not load your history"
          description="The API did not answer. Refresh the page or report it to the organiser."
        />
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          title="You have not submitted anything yet"
          description="Pick a problem, write a solution and submit it — the result will show up here."
          action={
            <Link
              href="/problems"
              className="border border-rule-strong px-4 py-2 text-label uppercase tracking-[0.08em] no-underline hover:bg-paper-raised"
            >
              Browse problems
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <>
      {/* Desktop: a table. */}
      <table className="mt-6 hidden w-full border-collapse sm:table">
        <thead>
          <tr className="border-b border-rule-strong text-left">
            <th className="label py-2 font-medium">When</th>
            <th className="label py-2 font-medium">Problem</th>
            <th className="label py-2 font-medium">Language</th>
            <th className="label py-2 font-medium">Result</th>
            <th className="label py-2 text-right font-medium">Time</th>
            <th className="label py-2 text-right font-medium">Memory</th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((submission) => (
            <tr
              key={submission.id}
              className="border-b border-rule transition-colors duration-[var(--dur-fast)] hover:bg-paper-raised"
            >
              <td className="py-2.5 text-small text-ink-muted">
                <Link href={`/submissions/${submission.id}`} className="no-underline">
                  {formatRelative(submission.createdAt)}
                </Link>
              </td>
              <td className="py-2.5">
                <Link
                  href={`/submissions/${submission.id}`}
                  className="flex items-center gap-2 no-underline"
                >
                  <Balloon
                    slug={submission.problemSlug}
                    size="sm"
                    state={submission.verdict === "AC" ? "solved" : "attempted"}
                  />
                  <span className="font-[family-name:var(--font-display)] text-body">
                    {submission.problemTitle}
                  </span>
                </Link>
              </td>
              <td className="py-2.5 text-small text-ink-muted">
                {getLanguage(submission.language)?.label ?? submission.language}
              </td>
              <td className="py-2.5">
                <VerdictBadge verdict={submission.verdict} status={submission.status} />
              </td>
              <td className="py-2.5 text-right text-small tabular-nums text-ink-muted">
                {formatTime(submission.maxTime)}
              </td>
              <td className="py-2.5 text-right text-small tabular-nums text-ink-muted">
                {formatMemory(submission.maxMemory)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phone: cards. */}
      <ul className="mt-6 sm:hidden">
        {submissions.map((submission) => (
          <li key={submission.id} className="border-b border-rule">
            <Link
              href={`/submissions/${submission.id}`}
              className="flex flex-col gap-1.5 py-3 no-underline"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <Balloon
                    slug={submission.problemSlug}
                    size="sm"
                    state={submission.verdict === "AC" ? "solved" : "attempted"}
                  />
                  <span className="truncate font-[family-name:var(--font-display)] text-body">
                    {submission.problemTitle}
                  </span>
                </span>
                <VerdictBadge verdict={submission.verdict} status={submission.status} />
              </span>

              <span className="flex justify-between text-micro text-ink-faint">
                <span>{formatRelative(submission.createdAt)}</span>
                <span className="tabular-nums">
                  {formatTime(submission.maxTime)} ·{" "}
                  {formatMemory(submission.maxMemory)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
