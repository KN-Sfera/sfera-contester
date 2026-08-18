import type { Metadata } from "next";
import { RunConsole } from "@/components/domain/run-console";

export const metadata: Metadata = {
  title: "Run",
  description:
    "Write code, feed it your own input and run it in the judging sandbox.",
};

/**
 * The landing screen is the scratchpad, not the problem list.
 *
 * Someone arriving here for the first time has no account and no problem in
 * mind. Give them the one thing that works without either — a compiler — and
 * let the problems be the step they take next.
 */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule-strong px-4 py-6 sm:px-6">
        <h1 className="text-display leading-none">Run</h1>
        <p className="max-w-md text-label text-ink-muted">
          A scratchpad on the judge&apos;s own sandbox. Nothing is recorded.
        </p>
      </header>

      <RunConsole />
    </div>
  );
}
