import type { Metadata } from "next";
import { RequireSession } from "@/components/domain/require-session";
import { SubmissionHistory } from "@/components/domain/submission-history";

export const metadata: Metadata = { title: "History" };

export default function SubmissionsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="border-b border-rule-strong pb-4">
        <h1 className="text-display leading-none">History</h1>
        <p className="mt-2 text-small text-ink-muted">
          Every solution you have sent, newest first.
        </p>
      </header>

      <RequireSession>
        <SubmissionHistory />
      </RequireSession>
    </div>
  );
}
