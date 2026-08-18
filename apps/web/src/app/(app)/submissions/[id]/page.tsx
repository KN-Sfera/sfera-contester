import type { Metadata } from "next";
import { RequireSession } from "@/components/domain/require-session";
import { SubmissionDetailView } from "@/components/domain/submission-detail";

export const metadata: Metadata = { title: "Submission" };

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <RequireSession>
        <SubmissionDetailView id={id} />
      </RequireSession>
    </div>
  );
}
