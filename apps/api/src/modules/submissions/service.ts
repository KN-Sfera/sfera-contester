import { and, eq } from "drizzle-orm";
import { problems, type Database } from "@sfera/db";
import type { JudgeQueue } from "@sfera/queue";
import type { LanguageId } from "@sfera/shared";
import { createSubmission } from "./repository.js";

export class ProblemNotAvailableError extends Error {
  constructor(slug: string) {
    super(`Problem ${slug} does not exist or is not published`);
    this.name = "ProblemNotAvailableError";
  }
}

export interface SubmitInput {
  userId: string;
  problemSlug: string;
  language: LanguageId;
  source: string;
}

/**
 * Stores the submission and enqueues it. Returns immediately — judging
 * happens in the worker; the request does not wait for Judge0.
 */
export async function submit(
  db: Database,
  queue: JudgeQueue,
  input: SubmitInput,
): Promise<{ submissionId: string }> {
  const [problem] = await db
    .select({ id: problems.id })
    .from(problems)
    .where(
      and(eq(problems.slug, input.problemSlug), eq(problems.isPublic, true)),
    )
    .limit(1);

  if (!problem) {
    throw new ProblemNotAvailableError(input.problemSlug);
  }

  const submission = await createSubmission(db, {
    userId: input.userId,
    problemId: problem.id,
    language: input.language,
    source: input.source,
  });

  // We enqueue after saving — the other order would let the worker pick up a
  // submission that is not in the database yet.
  await queue.enqueue({ submissionId: submission.id });

  return { submissionId: submission.id };
}
