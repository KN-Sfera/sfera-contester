import {
  compareOutputs,
  getLanguage,
  MAX_EXPECTED_BYTES,
  MAX_SOURCE_BYTES,
  MAX_STDIN_BYTES,
  type LanguageId,
  type RunResult,
  type Verdict,
} from "@sfera/shared";

export interface Judge0Status {
  id: number;
  description: string;
}

interface Judge0Submission {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
  exit_code: number | null;
  status: Judge0Status;
}

function mapJudge0Status(status: Judge0Status): Verdict {
  switch (status.id) {
    case 3:
      return "OK";
    case 4:
      return "WA";
    case 5:
      return "TLE";
    case 6:
      return "CE";
    case 7:
    case 8:
    case 9:
    case 10:
    case 11:
    case 12:
      return "RE";
    case 13:
    case 14:
      return "SE";
    default:
      return "SE";
  }
}

// Judge0 status 17 is Memory Limit Exceeded in some versions; also check description.
export function mapVerdict(status: Judge0Status): Verdict {
  const description = status.description.toLowerCase();
  if (description.includes("memory limit")) return "MLE";
  if (description.includes("time limit")) return "TLE";
  if (description.includes("compilation")) return "CE";
  if (description.includes("wrong answer")) return "WA";
  if (description.includes("accepted")) return "OK";
  return mapJudge0Status(status);
}

/** Rzucane, gdy Judge0 jest nieosiągalny lub odpowiada błędem — nadaje się do retry. */
export class Judge0UnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Judge0UnavailableError";
  }
}

export interface ExecuteInput {
  language: LanguageId;
  source: string;
  stdin?: string;
  expectedStdout?: string;
  cpuTimeLimit?: number;
  memoryLimit?: number;
}

export interface Judge0Client {
  execute: (input: ExecuteInput) => Promise<RunResult>;
  waitUntilReady: (timeoutMs?: number) => Promise<void>;
}

/**
 * Baza URL jest parametrem, a nie odczytem z env — dzięki temu tej samej paczki
 * używa API i worker, każdy ze swoją konfiguracją.
 */
export function createJudge0Client(options: { baseUrl: string }): Judge0Client {
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function waitUntilReady(timeoutMs = 120_000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        const response = await fetch(`${baseUrl}/about`);
        if (response.ok) return;
      } catch {
        // still booting
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Judge0UnavailableError(
      `Judge0 at ${baseUrl} did not become ready in time`,
    );
  }

  async function execute(input: ExecuteInput): Promise<RunResult> {
    const language = getLanguage(input.language);
    if (!language) {
      throw new Error(`Unsupported language: ${input.language}`);
    }

    if (Buffer.byteLength(input.source, "utf8") > MAX_SOURCE_BYTES) {
      throw new Error(`Source exceeds ${MAX_SOURCE_BYTES} bytes`);
    }
    if (
      input.stdin &&
      Buffer.byteLength(input.stdin, "utf8") > MAX_STDIN_BYTES
    ) {
      throw new Error(`stdin exceeds ${MAX_STDIN_BYTES} bytes`);
    }
    if (
      input.expectedStdout &&
      Buffer.byteLength(input.expectedStdout, "utf8") > MAX_EXPECTED_BYTES
    ) {
      throw new Error(`expectedStdout exceeds ${MAX_EXPECTED_BYTES} bytes`);
    }

    const body = {
      source_code: input.source,
      language_id: language.judge0Id,
      stdin: input.stdin ?? "",
      cpu_time_limit: input.cpuTimeLimit ?? 2,
      memory_limit: input.memoryLimit ?? 128000,
      wall_time_limit: (input.cpuTimeLimit ?? 2) * 2 + 1,
    };

    const response = await fetch(
      `${baseUrl}/submissions?base64_encoded=false&wait=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Judge0UnavailableError(
        `Cannot reach Judge0 at ${baseUrl} (${reason}). Is docker compose up?`,
      );
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Judge0UnavailableError(
        `Judge0 error ${response.status}: ${text}`,
      );
    }

    const submission = (await response.json()) as Judge0Submission;
    let verdict = mapVerdict(submission.status);

    if (verdict === "OK" && input.expectedStdout !== undefined) {
      verdict = compareOutputs(submission.stdout ?? "", input.expectedStdout)
        ? "AC"
        : "WA";
    }

    return {
      verdict,
      status: submission.status.description,
      stdout: submission.stdout ?? "",
      stderr: submission.stderr ?? "",
      compileOutput: submission.compile_output ?? "",
      time: submission.time,
      memory: submission.memory,
      exitCode: submission.exit_code,
      message: submission.message,
    };
  }

  return { execute, waitUntilReady };
}
