import type { JudgeJob, JudgePriority, JudgeQueue } from "@sfera/queue";

export interface FakeJudgeQueue extends JudgeQueue {
  jobs: { job: JudgeJob; priority: JudgePriority }[];
}

/**
 * A queue fake for the HTTP tests — we check that the API enqueues a job
 * without standing up Redis. The real BullMQ flow is covered by the worker tests.
 */
export function createFakeJudgeQueue(): FakeJudgeQueue {
  const jobs: { job: JudgeJob; priority: JudgePriority }[] = [];

  return {
    jobs,
    async enqueue(job, priority = "submission") {
      jobs.push({ job, priority });
    },
    async close() {},
  };
}
