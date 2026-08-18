import type { BalloonState } from "@/components/ui/balloon";
import type { SubmissionSummary } from "@/lib/api/types";

/**
 * Per-problem state derived from your own submissions.
 *
 * The API does not return this with the problem list, and rightly so: the list
 * is public and cached, while progress is private. We assemble it client-side
 * and lay it over the server-rendered list.
 */

export interface ProblemProgress {
  state: BalloonState;
  attempts: number;
  /** Failed attempts *before* the accepted one — exactly what ICPC penalty counts. */
  failedBeforeSolve: number;
}

export type ProgressMap = Map<string, ProblemProgress>;

export function buildProgress(
  submissions: readonly SubmissionSummary[],
): ProgressMap {
  const map: ProgressMap = new Map();

  // Oldest first, so that "before the accepted one" means anything.
  const ordered = [...submissions].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );

  for (const submission of ordered) {
    const current = map.get(submission.problemSlug) ?? {
      state: "attempted" as BalloonState,
      attempts: 0,
      failedBeforeSolve: 0,
    };

    current.attempts += 1;

    if (submission.verdict === "AC") {
      current.state = "solved";
    } else if (current.state !== "solved" && submission.verdict !== null) {
      // A submission still in the queue is not a failure yet.
      current.failedBeforeSolve += 1;
    }

    map.set(submission.problemSlug, current);
  }

  return map;
}

export function progressOf(
  map: ProgressMap,
  slug: string,
): ProblemProgress {
  return (
    map.get(slug) ?? { state: "untouched", attempts: 0, failedBeforeSolve: 0 }
  );
}
