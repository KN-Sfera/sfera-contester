"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getLanguage } from "@sfera/shared";
import { Balloon } from "@/components/ui/balloon";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { CodeEditor } from "@/components/editor/code-editor";
import { getSubmission } from "@/lib/api/submissions";
import type { SubmissionDetail } from "@/lib/api/types";
import { formatDateTime, formatMemory, formatTime, plural } from "@/lib/format";
import { isPending } from "@/lib/verdict";
import { LiveVerdict } from "./live-verdict";
import { TestStrip } from "./test-strip";
import { VerdictBanner } from "./verdict-banner";

/**
 * A single submission.
 *
 * If judging is still running we attach the stream and the strip fills in
 * live. If it is over, we show the recorded result.
 *
 * There is deliberately no `stderr` and no hidden-test input here: the API
 * does not send them, because on an incorrect solution they can leak test
 * data. The contestant gets a test number and a verdict.
 */
export function SubmissionDetailView({ id }: { id: string }) {
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      setSubmission(await getSubmission(id));
    } catch {
      // Someone else's submission and a non-existent one both return 404 —
      // that is deliberate on the API side, so we do not distinguish either.
      setMissing(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (missing) {
    return (
      <EmptyState
        title="No such submission"
        description="The link is wrong, or the solution belongs to somebody else."
        action={
          <Link
            href="/submissions"
            className="border border-rule-strong px-4 py-2 text-label uppercase tracking-[0.08em] no-underline hover:bg-paper-raised"
          >
            Back to history
          </Link>
        }
      />
    );
  }

  if (!submission) {
    return (
      <div aria-busy="true">
        <SkeletonRows rows={4} />
      </div>
    );
  }

  const pending = isPending(submission.status);
  const total = submission.results.length;

  return (
    <article className="flex flex-col gap-6">
      <header className="border-b border-rule pb-4">
        <Link
          href="/submissions"
          className="text-micro uppercase tracking-[0.1em] text-ink-faint no-underline hover:text-ink-muted"
        >
          ← History
        </Link>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Link
            href={`/problems/${submission.problemSlug}`}
            className="flex items-center gap-2.5 no-underline"
          >
            <Balloon
              slug={submission.problemSlug}
              size="lg"
              state={submission.verdict === "AC" ? "solved" : "attempted"}
            />
            <h1 className="text-heading leading-none">{submission.problemTitle}</h1>
          </Link>

          <p className="text-label text-ink-muted">
            {formatDateTime(submission.createdAt)}
          </p>
        </div>
      </header>

      {pending ? (
        <LiveVerdict
          submissionId={submission.id}
          slug={submission.problemSlug}
          onSettled={load}
        />
      ) : submission.verdict ? (
        <div className="flex flex-col gap-4">
          <VerdictBanner
            slug={submission.problemSlug}
            verdict={submission.verdict}
            failedTestOrdinal={submission.failedTestOrdinal}
            total={total}
            maxTime={submission.maxTime}
            maxMemory={submission.maxMemory}
          />

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="label">Tests</span>
              <span className="text-micro tabular-nums text-ink-muted">
                {total > 0 ? `${total} ${plural(total, "test", "tests")}` : ""}
              </span>
            </div>
            <TestStrip
              total={total}
              results={submission.results.map((result) => result.verdict)}
            />
          </div>

          <TestTable results={submission.results} />
        </div>
      ) : (
        <p className="border border-rule-strong px-4 py-3 text-small">
          Judging failed. This is a failure on our side — report it to the
          organiser.
        </p>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="label">Code</span>
          <span className="text-micro text-ink-faint">
            {getLanguage(submission.language)?.label ?? submission.language}
          </span>
        </div>
        <div className="h-96 border border-rule">
          <CodeEditor
            value={submission.source}
            language={submission.language}
            readOnly
          />
        </div>
      </section>
    </article>
  );
}

function TestTable({ results }: { results: SubmissionDetail["results"] }) {
  if (results.length === 0) return null;

  return (
    <details className="border border-rule">
      <summary className="cursor-pointer px-3 py-2 text-label uppercase tracking-[0.08em] text-ink-muted">
        Per-test results
      </summary>
      <table className="w-full border-collapse border-t border-rule text-small">
        <thead>
          <tr className="text-left">
            <th className="label-micro px-3 py-1.5 font-medium">Test</th>
            <th className="label-micro px-3 py-1.5 font-medium">Verdict</th>
            <th className="label-micro px-3 py-1.5 text-right font-medium">Time</th>
            <th className="label-micro px-3 py-1.5 text-right font-medium">Memory</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.ordinal} className="border-t border-rule">
              <td className="px-3 py-1.5 tabular-nums">{result.ordinal}</td>
              <td className="px-3 py-1.5">{result.verdict}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-ink-muted">
                {formatTime(result.time)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-ink-muted">
                {formatMemory(result.memory)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
