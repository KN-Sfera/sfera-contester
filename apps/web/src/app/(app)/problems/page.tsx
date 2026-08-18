import type { Metadata } from "next";
import type { ProblemSummary } from "@sfera/shared";
import { ProblemList } from "@/components/domain/problem-list";
import { EmptyState } from "@/components/ui/empty-state";
import { listProblems } from "@/lib/api/problems";

export const metadata: Metadata = { title: "Problems" };

/**
 * Rendered on request, not at build time. During `docker compose build` the
 * API is not up yet, so prerendering would bake a "no connection" message into
 * the page. The request itself is cached for 30 s, so the cost is nil.
 */
export const dynamic = "force-dynamic";

/**
 * The problem booklet's table of contents.
 *
 * The list is public, so the server renders it — content is on screen at once.
 * Solved state is private and arrives separately; the balloon column fills in
 * on a second pass (see `ProblemList`).
 */
export default async function ProblemsPage() {
  let problems: ProblemSummary[] = [];
  let failed = false;

  try {
    problems = await listProblems();
  } catch {
    failed = true;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule-strong pb-4">
        <h1 className="text-display leading-none">Problems</h1>
        <p className="text-label text-ink-muted">
          {problems.length} in the set
        </p>
      </header>

      {failed ? (
        <div className="mt-8">
          <EmptyState
            title="No connection to the API"
            description="The judging server is not answering. Check that the backend is running, then refresh."
          />
        </div>
      ) : problems.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No problems yet"
            description="The organiser has not published anything. Check back in a moment."
          />
        </div>
      ) : (
        <ProblemList problems={problems} />
      )}
    </div>
  );
}
