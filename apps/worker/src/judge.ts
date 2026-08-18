import type { Database } from "@sfera/db";
import type { Judge0Client } from "@sfera/judge0";
import type { JudgeProgressBus } from "@sfera/queue";
import type { Verdict } from "@sfera/shared";
import {
  finishSubmission,
  loadJudgeTask,
  markRunning,
  type TestOutcome,
} from "./repository.js";
import { parseTime, summarizeRun } from "./summarize.js";

export class SubmissionNotFoundError extends Error {
  constructor(submissionId: string) {
    super(`No such submission: ${submissionId}`);
    this.name = "SubmissionNotFoundError";
  }
}

export interface JudgeDeps {
  db: Database;
  judge0: Judge0Client;
  progress: JudgeProgressBus;
}

/**
 * Judges a single submission.
 *
 * Stops at the first failing test — the ICPC rule (solved or not, no partial
 * credit) plus the saving in Judge0 time, which in the closing
 * minutach konkursu brakuje najbardziej.
 *
 * Judge0 errors are passed upwards so that BullMQ can retry the job.
 */
export async function judgeSubmission(
  deps: JudgeDeps,
  submissionId: string,
): Promise<void> {
  const task = await loadJudgeTask(deps.db, submissionId);
  if (!task) {
    throw new SubmissionNotFoundError(submissionId);
  }

  await markRunning(deps.db, submissionId);
  await deps.progress.publish({
    type: "started",
    submissionId,
    totalTests: task.tests.length,
  });

  const outcomes: TestOutcome[] = [];

  for (const test of task.tests) {
    const result = await deps.judge0.execute({
      language: task.language,
      source: task.source,
      stdin: test.input,
      expectedStdout: test.expectedOutput,
      cpuTimeLimit: task.timeLimit,
      memoryLimit: task.memoryLimit,
    });

    // "OK" only comes back when no expected output was given, and here we always give one.
    const verdict = (result.verdict === "OK" ? "WA" : result.verdict) as Exclude<
      Verdict,
      "OK"
    >;

    outcomes.push({
      testCaseId: test.id,
      ordinal: test.ordinal,
      verdict,
      time: parseTime(result.time),
      memory: result.memory,
      stderr: result.stderr,
      compileOutput: result.compileOutput,
    });

    await deps.progress.publish({
      type: "test",
      submissionId,
      ordinal: test.ordinal,
      totalTests: task.tests.length,
      verdict,
    });

    if (verdict !== "AC") break;
  }

  const summary = summarizeRun(outcomes);

  await finishSubmission(deps.db, {
    submissionId,
    verdict: summary.verdict,
    failedTestOrdinal: summary.failedTestOrdinal,
    maxTime: summary.maxTime,
    maxMemory: summary.maxMemory,
    outcomes,
  });

  await deps.progress.publish({
    type: "done",
    submissionId,
    verdict: summary.verdict,
    failedTestOrdinal: summary.failedTestOrdinal,
  });
}
