import type { Verdict } from "@sfera/shared";
import { cx } from "@/lib/cx";
import { statusLabel, verdictMeta, type SubmissionStatus } from "@/lib/verdict";

/**
 * A verdict as a badge.
 *
 * The abbreviation stays, because that is what hangs on the scoreboard and
 * that is the language contestants speak. The expansion goes into `title` and
 * to screen readers — the abbreviation alone is a barrier for anyone at their
 * first contest.
 */

export interface VerdictBadgeProps {
  verdict: Verdict | null;
  status?: SubmissionStatus;
  size?: "sm" | "md";
  className?: string;
}

export function VerdictBadge({
  verdict,
  status,
  size = "sm",
  className,
}: VerdictBadgeProps) {
  const padding = size === "sm" ? "h-6 px-2 text-micro" : "h-8 px-3 text-label";

  if (!verdict) {
    const label = status ? statusLabel(status) : "Pending";
    return (
      <span
        className={cx(
          "inline-flex items-center gap-1.5 border border-rule text-ink-muted",
          "rounded-[2px] font-medium uppercase tracking-[0.1em]",
          padding,
          className,
        )}
      >
        {status && status !== "FAILED" && (
          <span
            aria-hidden="true"
            className="size-1.5 animate-[pulse_1400ms_ease-in-out_infinite] rounded-full bg-current"
          />
        )}
        {label}
      </span>
    );
  }

  const meta = verdictMeta(verdict);

  return (
    <span
      title={`${meta.label} — ${meta.description}`}
      className={cx(
        "inline-flex items-center border font-medium uppercase tracking-[0.1em]",
        "rounded-[2px]",
        padding,
        className,
      )}
      style={{
        color: meta.color,
        borderColor: `color-mix(in srgb, ${meta.color} 45%, transparent)`,
        background: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
      }}
    >
      {meta.code}
      <span className="sr-only"> — {meta.label}</span>
    </span>
  );
}
