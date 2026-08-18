"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ProblemSummary } from "@sfera/shared";
import { Balloon } from "@/components/ui/balloon";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { listSubmissions } from "@/lib/api/submissions";
import { problemLetter } from "@/lib/balloon";
import { cx } from "@/lib/cx";
import { formatLimitMemory, formatLimitTime, plural } from "@/lib/format";
import { useEnter } from "@/lib/motion/use-enter";
import { buildProgress, progressOf, type ProgressMap } from "@/lib/progress";

/**
 * The problem list as a table of contents.
 *
 * Letter, balloon, title, leader line, limits — the layout comes straight from
 * a printed problem booklet. The balloon column down the left shows progress
 * without reading anything.
 */

type Filter = "all" | "unsolved" | "solved" | "attempted";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "unsolved", label: "Unsolved" },
  { value: "solved", label: "Solved" },
  { value: "attempted", label: "Attempted" },
] as const;

export function ProblemList({ problems }: { problems: ProblemSummary[] }) {
  const [progress, setProgress] = useState<ProgressMap>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    listSubmissions()
      .then((submissions) => {
        if (cancelled) return;
        setProgress(buildProgress(submissions ?? []));
        setLoaded(true);
      })
      .catch(() => {
        // Having no session is an ordinary case — the problem list is public
        // and has to work for signed-out visitors, just without balloons.
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The cascade fires when the statuses land — showing the real loading phase
  // instead of hiding it.
  const container = useEnter<HTMLOListElement>(loaded, "[data-balloon-cell]");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return problems.filter((problem) => {
      if (needle && !problem.title.toLowerCase().includes(needle)) return false;

      const state = progressOf(progress, problem.slug).state;
      if (filter === "solved") return state === "solved";
      if (filter === "unsolved") return state !== "solved";
      if (filter === "attempted") return state === "attempted";
      return true;
    });
  }, [problems, progress, filter, query]);

  return (
    <>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5 sm:max-w-xs">
          <span className="label">Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="problem title"
            className="h-9 w-full border border-rule-strong bg-paper-sunken px-2.5 text-small placeholder:text-ink-muted hover:border-ink-muted focus:border-ink"
          />
        </label>

        <Select
          label="Filter"
          options={FILTERS}
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
          className="w-40"
        />
      </div>

      {visible.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Nothing matches"
            description="Change the filter or clear the search to see the remaining problems."
          />
        </div>
      ) : (
        <ol ref={container} className="mt-6">
          {visible.map((problem) => (
            <ProblemRow
              key={problem.slug}
              problem={problem}
              /* The letter is fixed per problem, so it comes from the full
                 list rather than the filtered one — otherwise "problem C"
                 would change with every filter. */
              letter={problemLetter(
                problems.findIndex((item) => item.slug === problem.slug),
              )}
              progress={progressOf(progress, problem.slug)}
            />
          ))}
        </ol>
      )}
    </>
  );
}

function ProblemRow({
  problem,
  letter,
  progress,
}: {
  problem: ProblemSummary;
  letter: string;
  progress: ReturnType<typeof progressOf>;
}) {
  return (
    <li className="border-b border-rule">
      <Link
        href={`/problems/${problem.slug}`}
        className={cx(
          "group grid grid-cols-[auto_auto_1fr] items-baseline gap-x-3 gap-y-1 py-3 no-underline",
          "sm:grid-cols-[auto_auto_1fr_auto] sm:gap-x-4",
          "transition-colors duration-[var(--dur-fast)] hover:bg-paper-raised",
        )}
      >
        <span data-balloon-cell className="flex w-4 justify-center self-center">
          <Balloon slug={problem.slug} state={progress.state} />
        </span>

        <span className="font-[family-name:var(--font-display)] text-subhead leading-none text-ink-faint">
          {letter}
        </span>

        <span className="flex min-w-0 items-baseline gap-3">
          <span className="truncate font-[family-name:var(--font-display)] text-subhead leading-tight">
            {problem.title}
          </span>
          {/* A leader line as in a table of contents — it walks the eye to the limits. */}
          <span
            aria-hidden="true"
            className="hidden h-px min-w-6 flex-1 self-center bg-rule sm:block"
          />
        </span>

        <span className="col-start-3 flex flex-wrap items-baseline gap-x-3 text-micro text-ink-faint sm:col-start-4 sm:justify-end">
          <span>{formatLimitTime(problem.timeLimit)}</span>
          <span>{formatLimitMemory(problem.memoryLimit)}</span>
          <span className="min-w-16 sm:text-right">{statusText(progress)}</span>
        </span>
      </Link>
    </li>
  );
}

function statusText(progress: ReturnType<typeof progressOf>): string {
  if (progress.state === "solved") {
    return progress.failedBeforeSolve > 0
      ? `AC (+${progress.failedBeforeSolve})`
      : "AC";
  }
  if (progress.attempts === 0) return "";
  return `${progress.attempts} ${plural(progress.attempts, "try", "tries")}`;
}
