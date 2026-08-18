import type { Verdict } from "@sfera/shared";

/** A queued job carries only the id — the rest is in the database anyway. */
export interface JudgeJob {
  submissionId: string;
}

/**
 * BullMQ priorities: a lower number runs sooner. A contest submission cannot
 * queue behind practice runs in the closing minutes of a contest.
 */
export const JUDGE_PRIORITY = {
  contest: 1,
  submission: 5,
} as const;

export type JudgePriority = keyof typeof JUDGE_PRIORITY;

export type JudgeProgressEvent =
  | { type: "started"; submissionId: string; totalTests: number }
  | {
      type: "test";
      submissionId: string;
      ordinal: number;
      totalTests: number;
      verdict: Verdict;
    }
  | {
      type: "done";
      submissionId: string;
      verdict: Verdict;
      failedTestOrdinal: number | null;
    }
  | { type: "failed"; submissionId: string; message: string };

/**
 * The job producer. The API knows only this interface — swapping BullMQ for
 * RabbitMQ in Phase 5 will not touch the domain layer.
 */
export interface JudgeQueue {
  enqueue: (job: JudgeJob, priority?: JudgePriority) => Promise<void>;
  close: () => Promise<void>;
}

/** The progress channel. The worker publishes, the API subscribes and forwards to SSE. */
export interface JudgeProgressBus {
  publish: (event: JudgeProgressEvent) => Promise<void>;
  subscribe: (
    submissionId: string,
    listener: (event: JudgeProgressEvent) => void,
  ) => Promise<() => Promise<void>>;
  close: () => Promise<void>;
}
