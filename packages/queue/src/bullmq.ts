import { Queue, Worker, type Job, type WorkerOptions } from "bullmq";
import { Redis } from "ioredis";
import {
  JUDGE_PRIORITY,
  type JudgeJob,
  type JudgePriority,
  type JudgeQueue,
} from "./types.js";

export const JUDGE_QUEUE_NAME = "judge";

export function createRedis(url: string): Redis {
  return new Redis(url, {
    // Required by BullMQ — without it workers drop jobs during a brief Redis
    // outage instead of waiting.
    maxRetriesPerRequest: null,
  });
}

export interface BullJudgeQueueOptions {
  connection: Redis;
}

export function createBullJudgeQueue(
  options: BullJudgeQueueOptions,
): JudgeQueue {
  const queue = new Queue<JudgeJob>(JUDGE_QUEUE_NAME, {
    connection: options.connection,
    defaultJobOptions: {
      // Only infrastructure failures are retried — the worker decides whether
      // an error is retryable by throwing the matching exception type.
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });

  return {
    async enqueue(job, priority = "submission") {
      await queue.add(JUDGE_QUEUE_NAME, job, {
        // Deduplication: the same submission must not enter the queue twice.
        jobId: job.submissionId,
        priority: JUDGE_PRIORITY[priority as JudgePriority],
      });
    },
    close: () => queue.close(),
  };
}

export interface JudgeWorkerOptions {
  connection: Redis;
  concurrency: number;
  process: (job: JudgeJob) => Promise<void>;
  onError?: (error: Error) => void;
}

export function createJudgeWorker(options: JudgeWorkerOptions): Worker<JudgeJob> {
  const workerOptions: WorkerOptions = {
    connection: options.connection,
    concurrency: options.concurrency,
  };

  const worker = new Worker<JudgeJob>(
    JUDGE_QUEUE_NAME,
    async (job: Job<JudgeJob>) => options.process(job.data),
    workerOptions,
  );

  if (options.onError) {
    worker.on("error", options.onError);
  }

  return worker;
}
