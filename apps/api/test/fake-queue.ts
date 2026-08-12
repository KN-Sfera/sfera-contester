import type { JudgeJob, JudgePriority, JudgeQueue } from "@sfera/queue";

export interface FakeJudgeQueue extends JudgeQueue {
  jobs: { job: JudgeJob; priority: JudgePriority }[];
}

/**
 * Atrapa kolejki dla testów HTTP — sprawdzamy, że API wrzuca zadanie, bez
 * stawiania Redisa. Prawdziwy przepływ przez BullMQ pokrywają testy workera.
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
