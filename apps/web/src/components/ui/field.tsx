"use client";

import { useId } from "react";
import { cx } from "@/lib/cx";

/**
 * A form field with a label, a hint and an error.
 *
 * The label sits above the field, not inside the placeholder — a placeholder
 * disappears as you type, so it cannot serve as a label. The error is wired up
 * through `aria-describedby` so a screen reader reads it together with the
 * field.
 */

export interface FieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({
  label,
  hint,
  error,
  className,
  ...props
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label">
        {label}
      </label>

      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          cx(hint && hintId, error && errorId).trim() || undefined
        }
        className={cx(
          "h-11 w-full border bg-paper-sunken px-3 text-small",
          "rounded-[2px] transition-colors duration-[var(--dur-fast)]",
          "placeholder:text-ink-faint",
          // A control boundary, not decoration — hence `rule-strong` (WCAG 1.4.11).
          error
            ? "border-[var(--v-wa)]"
            : "border-rule-strong hover:border-ink-muted focus:border-ink",
          className,
        )}
      />

      {hint && !error && (
        <p id={hintId} className="text-micro text-ink-faint">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="text-micro text-[var(--v-wa)]">
          {error}
        </p>
      )}
    </div>
  );
}
