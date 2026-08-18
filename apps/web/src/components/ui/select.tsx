"use client";

import { useId } from "react";
import { cx } from "@/lib/cx";

/**
 * A picker. A native `<select>`, not a custom dropdown — on a phone you get
 * the system wheel, and keyboard support arrives without a line of our code.
 * A custom implementation would be worse in both places.
 */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  options: readonly SelectOption[];
  /** Hides the label visually while leaving it for screen readers. */
  hideLabel?: boolean;
}

export function Select({
  label,
  options,
  hideLabel = false,
  className,
  ...props
}: SelectProps) {
  const id = useId();

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "label"}>
        {label}
      </label>
      <select
        {...props}
        id={id}
        className={cx(
          "h-9 w-full appearance-none border border-rule-strong bg-paper-sunken px-2.5 pr-7 text-label",
          "rounded-[2px] transition-colors duration-[var(--dur-fast)] hover:border-ink-muted focus:border-ink",
        )}
        // The arrow is drawn as a background — one element fewer in the tree,
        // and it cannot swallow clicks.
        style={{
          backgroundImage:
            "linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%)",
          backgroundSize: "5px 5px, 5px 5px",
          backgroundPosition: "right 0.9rem center, right 0.55rem center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
