import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProblemWorkspace } from "@/components/domain/problem-workspace";
import { Statement } from "@/components/domain/statement";
import { Balloon } from "@/components/ui/balloon";
import { ApiError } from "@/lib/api/client";
import { getProblem, listProblems } from "@/lib/api/problems";
import { problemLetter } from "@/lib/balloon";
import { formatLimitMemory, formatLimitTime } from "@/lib/format";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  try {
    const problem = await getProblem(slug);
    return { title: problem.title };
  } catch {
    return { title: "Problem" };
  }
}

/**
 * The problem page.
 *
 * The server fetches the statement (public) and the problem letter;
 * interaction lives in `ProblemWorkspace`. The statement is rendered here and
 * handed over as a ready node — that keeps Markdown and KaTeX out of the
 * browser bundle.
 */
export default async function ProblemPage({ params }: Params) {
  const { slug } = await params;

  let problem;
  try {
    problem = await getProblem(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // The letter comes from the position in the full list — the same one shown
  // in the table of contents. When the list is unreachable, there is no letter.
  let letter = "";
  try {
    const problems = await listProblems();
    const index = problems.findIndex((item) => item.slug === slug);
    if (index >= 0) letter = problemLetter(index);
  } catch {
    letter = "";
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-rule px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/problems"
            className="text-micro uppercase tracking-[0.1em] text-ink-faint no-underline hover:text-ink-muted"
          >
            ← Problems
          </Link>

          <span className="flex items-center gap-2.5">
            <Balloon slug={problem.slug} size="lg" />
            {letter && (
              <span className="font-[family-name:var(--font-display)] text-heading leading-none text-ink-faint">
                {letter}
              </span>
            )}
            <h1 className="text-heading leading-none">{problem.title}</h1>
          </span>

          <p className="ml-auto text-label text-ink-muted">
            {formatLimitTime(problem.timeLimit)} ·{" "}
            {formatLimitMemory(problem.memoryLimit)}
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1600px] flex-1">
        <ProblemWorkspace
          problem={problem}
          letter={letter}
          statement={<Statement markdown={problem.statement} />}
        />
      </div>
    </div>
  );
}
