import type { ExecuteInput, Judge0Client } from "@sfera/judge0";
import type { JudgeProgressBus, JudgeProgressEvent } from "@sfera/queue";
import type { RunResult, Verdict } from "@sfera/shared";

function result(verdict: Verdict, overrides: Partial<RunResult> = {}): RunResult {
  return {
    verdict,
    status: verdict,
    stdout: "",
    stderr: "",
    compileOutput: "",
    time: "0.010",
    memory: 1024,
    exitCode: 0,
    message: null,
    ...overrides,
  };
}

export interface FakeJudge0 extends Judge0Client {
  calls: ExecuteInput[];
}

/**
 * Judge0 replaced by a scripted list of verdicts — it lets us check the judging
 * logic (stopping at the first failure, aggregation) without booting a sandbox.
 */
export function createFakeJudge0(
  verdicts: (Verdict | RunResult)[],
): FakeJudge0 {
  const calls: ExecuteInput[] = [];
  let index = 0;

  return {
    calls,
    async execute(input) {
      calls.push(input);
      const next = verdicts[index++] ?? "AC";
      return typeof next === "string" ? result(next) : next;
    },
    async waitUntilReady() {},
  };
}

export interface RecordingProgressBus extends JudgeProgressBus {
  events: JudgeProgressEvent[];
}

export function createRecordingProgressBus(): RecordingProgressBus {
  const events: JudgeProgressEvent[] = [];

  return {
    events,
    async publish(event) {
      events.push(event);
    },
    async subscribe() {
      return async () => {};
    },
    async close() {},
  };
}
