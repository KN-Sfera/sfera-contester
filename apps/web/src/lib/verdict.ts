import type { Verdict } from "@sfera/shared";

/**
 * Verdicts in the presentation layer.
 *
 * The abbreviation is what contestants read off the scoreboard, so it stays as
 * the label. The full wording goes next to it — an abbreviation with no
 * expansion is a barrier for anyone at their first contest.
 */

export interface VerdictMeta {
  /** Abbreviation shown on the badge. */
  code: string;
  /** Expansion — under the badge or in a tooltip. */
  label: string;
  /** What the contestant should do about it. */
  description: string;
  /** CSS variable holding the colour. */
  color: string;
  /** Whether this is a success — decides the balloon. */
  accepted: boolean;
}

const META: Record<Verdict, VerdictMeta> = {
  AC: {
    code: "AC",
    label: "Accepted",
    description: "Every test passed.",
    color: "var(--v-ac)",
    accepted: true,
  },
  OK: {
    code: "OK",
    label: "Finished",
    description: "The program ran without an error.",
    color: "var(--v-ok)",
    accepted: false,
  },
  WA: {
    code: "WA",
    label: "Wrong answer",
    description: "The program produced something other than the expected output.",
    color: "var(--v-wa)",
    accepted: false,
  },
  TLE: {
    code: "TLE",
    label: "Time limit exceeded",
    description: "The program did not finish within the time limit.",
    color: "var(--v-tle)",
    accepted: false,
  },
  MLE: {
    code: "MLE",
    label: "Memory limit exceeded",
    description: "The program did not fit within the memory limit.",
    color: "var(--v-mle)",
    accepted: false,
  },
  RE: {
    code: "RE",
    label: "Runtime error",
    description:
      "The program stopped early — an exception, a segfault or a non-zero exit code.",
    color: "var(--v-re)",
    accepted: false,
  },
  CE: {
    code: "CE",
    label: "Compilation error",
    description: "The code did not compile.",
    color: "var(--v-ce)",
    accepted: false,
  },
  SE: {
    code: "SE",
    label: "System error",
    description: "A failure on our side — this is not the solution's fault.",
    color: "var(--v-se)",
    accepted: false,
  },
};

export function verdictMeta(verdict: Verdict): VerdictMeta {
  return META[verdict] ?? META.SE;
}

export function isAccepted(verdict: Verdict | null | undefined): boolean {
  return verdict === "AC";
}

/** Submission status, before a verdict exists. */
export type SubmissionStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

export function statusLabel(status: SubmissionStatus): string {
  switch (status) {
    case "QUEUED":
      return "Queued";
    case "RUNNING":
      return "Judging";
    case "DONE":
      return "Judged";
    case "FAILED":
      return "Not judged";
  }
}

export function isPending(status: SubmissionStatus): boolean {
  return status === "QUEUED" || status === "RUNNING";
}
