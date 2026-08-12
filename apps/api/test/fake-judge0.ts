import type { ExecuteInput, Judge0Client } from "@sfera/judge0";
import type { RunResult, Verdict } from "@sfera/shared";

export interface FakeJudge0 extends Judge0Client {
  calls: ExecuteInput[];
  /** Kolejne werdykty do oddania. Po wyczerpaniu listy zwraca AC. */
  script: (verdicts: Verdict[]) => void;
}

/**
 * Judge0 zastąpiony skryptem werdyktów. Pozwala testować walidację zadań
 * i playground bez odpalania sandboxa.
 */
export function createFakeJudge0(): FakeJudge0 {
  const calls: ExecuteInput[] = [];
  let verdicts: Verdict[] = [];
  let index = 0;

  return {
    calls,
    script(next) {
      verdicts = next;
      index = 0;
      calls.length = 0;
    },
    async execute(input): Promise<RunResult> {
      calls.push(input);
      const verdict = verdicts[index++] ?? "AC";
      return {
        verdict,
        status: verdict,
        stdout: verdict === "AC" ? (input.expectedStdout ?? "") : "zle-wyjscie",
        stderr: "",
        compileOutput: "",
        time: "0.010",
        memory: 1024,
        exitCode: 0,
        message: null,
      };
    },
    async waitUntilReady() {},
  };
}
