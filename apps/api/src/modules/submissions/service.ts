import { and, eq } from "drizzle-orm";
import { problems, type Database } from "@sfera/db";
import type { JudgeQueue } from "@sfera/queue";
import type { LanguageId } from "@sfera/shared";
import { createSubmission } from "./repository.js";

export class ProblemNotAvailableError extends Error {
  constructor(slug: string) {
    super(`Zadanie ${slug} nie istnieje lub nie jest opublikowane`);
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
 * Zapisuje submit i wrzuca go do kolejki. Zwraca natychmiast — ocenianie dzieje
 * się w workerze, request nie czeka na Judge0.
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

  // Kolejkujemy po zapisie — gdyby kolejność była odwrotna, worker mógłby
  // sięgnąć po submit, którego jeszcze nie ma w bazie.
  await queue.enqueue({ submissionId: submission.id });

  return { submissionId: submission.id };
}
