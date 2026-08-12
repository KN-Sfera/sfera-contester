import type { Verdict } from "@sfera/shared";

/** Zadanie w kolejce niesie samo id — reszta i tak jest w bazie. */
export interface JudgeJob {
  submissionId: string;
}

/**
 * Priorytety BullMQ: niższa liczba = wcześniej. Submit konkursowy nie może
 * czekać za kolejką ćwiczeniową w ostatnich minutach zawodów.
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
 * Producent zadań. API zna tylko ten interfejs — wymiana BullMQ na RabbitMQ
 * w Fazie 5 nie dotknie warstwy domeny.
 */
export interface JudgeQueue {
  enqueue: (job: JudgeJob, priority?: JudgePriority) => Promise<void>;
  close: () => Promise<void>;
}

/** Kanał postępu. Worker publikuje, API subskrybuje i przekazuje do SSE. */
export interface JudgeProgressBus {
  publish: (event: JudgeProgressEvent) => Promise<void>;
  subscribe: (
    submissionId: string,
    listener: (event: JudgeProgressEvent) => void,
  ) => Promise<() => Promise<void>>;
  close: () => Promise<void>;
}
