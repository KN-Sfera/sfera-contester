import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Contests" };

/**
 * A placeholder with a date attached to nothing is a lie, so this one says
 * only what is true: the judge already scores ICPC contests, and the screens
 * for running one are the next piece of work.
 */
export default function ContestsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule-strong pb-4">
        <h1 className="text-display leading-none">Contests</h1>
        <p className="text-label text-ink-muted">Soon</p>
      </header>

      <section className="mt-10 max-w-xl">
        <p className="font-[family-name:var(--font-display)] text-title leading-tight">
          Contests are coming.
        </p>

        <p className="mt-4 text-small leading-relaxed text-ink-muted">
          The judge already knows how to run one — ICPC scoring, the penalty
          clock, the leaderboard freeze and the unfreeze all live in the
          backend. What is missing is this side of it: the clock, the board and
          a problem page that knows the contest is running.
        </p>

        <ul className="mt-6 flex flex-col gap-2 border-t border-rule pt-4 text-small text-ink-muted">
          {[
            "A live leaderboard, balloons per contestant",
            "A contest clock synchronised with the server",
            "Registration, announcements and clarifications",
            "Virtual mode — an archived contest run in your own time",
          ].map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden="true" className="text-ink-faint">
                —
              </span>
              {item}
            </li>
          ))}
        </ul>

        <p className="mt-8 text-small text-ink-muted">
          Until then, the problems are open and every submission is judged.{" "}
          <Link href="/problems" className="text-ink underline">
            Go to the problems
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
