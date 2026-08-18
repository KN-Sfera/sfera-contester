import { cx } from "@/lib/cx";

/**
 * Button.
 *
 * The primary variant is **filled with ink and set in the paper colour** —
 * like a heading reversed out in print. There is no blue "primary": colour in
 * this interface means a verdict or a problem, so spending it on buttons would
 * strip it of its job.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ink text-paper border-ink hover:bg-ink-muted hover:border-ink-muted",
  secondary:
    "bg-transparent text-ink border-rule-strong hover:bg-paper-raised",
  ghost:
    "bg-transparent text-ink-muted border-transparent hover:text-ink hover:bg-paper-raised",
  danger:
    "bg-transparent text-[var(--v-wa)] border-[color-mix(in_srgb,var(--v-wa)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--v-wa)_12%,transparent)]",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-label",
  // 44px — the minimum touch target. On a phone this is the "Submit" button.
  md: "h-11 px-4 text-small",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 border font-medium uppercase tracking-[0.08em]",
        "rounded-[2px] transition-colors duration-[var(--dur-fast)]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/**
 * Work indicator. A square, not a circle — the only round thing in this
 * interface is the balloon, and that has to stay unambiguous.
 */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 animate-[spin_900ms_linear_infinite] border border-current border-t-transparent"
    />
  );
}
