import { UnrecoverableError } from "bullmq";
import { createDatabase } from "@sfera/db";
import { createJudge0Client } from "@sfera/judge0";
import {
  createJudgeWorker,
  createRedis,
  createRedisProgressBus,
} from "@sfera/queue";
import { config } from "./config.js";
import { judgeSubmission, SubmissionNotFoundError } from "./judge.js";
import { failSubmission } from "./repository.js";

async function main(): Promise<void> {
  const database = createDatabase({ connectionString: config.DATABASE_URL });
  const publisher = createRedis(config.REDIS_URL);
  const connection = createRedis(config.REDIS_URL);
  const progress = createRedisProgressBus({
    publisher,
    createSubscriber: () => createRedis(config.REDIS_URL),
  });
  const judge0 = createJudge0Client({ baseUrl: config.JUDGE0_URL });

  await judge0.waitUntilReady().catch((error: unknown) => {
    console.warn("Judge0 is not up yet, retrying:", error);
  });

  const worker = createJudgeWorker({
    connection,
    concurrency: config.JUDGE_CONCURRENCY,
    onError: (error) => console.error("Worker error:", error),
    process: async (job) => {
      try {
        await judgeSubmission(
          { db: database.db, judge0, progress },
          job.submissionId,
        );
      } catch (error) {
        // A missing submission will not fix itself on a retry — we drop the
        // job at once instead of hammering the same thing three times.
        if (error instanceof SubmissionNotFoundError) {
          throw new UnrecoverableError(error.message);
        }
        throw error;
      }
    },
  });

  worker.on("failed", (job, error) => {
    if (!job) return;
    const submissionId = job.data.submissionId;

    // A submission is marked FAILED only once the retries run out — earlier
    // attempts mean Judge0 was briefly unavailable, not that the solution
    // failed.
    const retryable = !(error instanceof UnrecoverableError);
    const attemptsExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (retryable && !attemptsExhausted) return;

    void failSubmission(database.db, submissionId, error.message)
      .then(() =>
        progress.publish({
          type: "failed",
          submissionId,
          message: error.message,
        }),
      )
      .catch((cause: unknown) =>
        console.error("Could not record the submission failure:", cause),
      );
  });

  console.log(
    `Worker ready — concurrency ${config.JUDGE_CONCURRENCY}, Judge0 ${config.JUDGE0_URL}`,
  );

  const shutdown = async (signal: string) => {
    console.log(`${signal} — zamykam workera`);
    // close() waits for in-flight jobs to finish, so as not to leave submissions
    // w stanie RUNNING.
    await worker.close();
    await progress.close();
    await Promise.all([publisher.quit(), connection.quit()]);
    await database.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
