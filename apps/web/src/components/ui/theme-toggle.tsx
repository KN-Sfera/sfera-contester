"use client";

import { useTheme } from "@/lib/theme/theme-context";

/**
 * The ink/paper switch.
 *
 * The icon is two squares in counter — it shows exactly what the button does
 * and does not pretend to be a sun or a moon.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to the ${next} theme`}
      aria-label={`Switch to the ${next} theme`}
      className="inline-flex size-8 items-center justify-center border border-rule text-ink-muted transition-colors duration-[var(--dur-fast)] hover:border-rule-strong hover:text-ink"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <rect x="0.5" y="0.5" width="13" height="13" fill="none" stroke="currentColor" />
        <rect x="0.5" y="0.5" width="6.5" height="13" fill="currentColor" />
      </svg>
    </button>
  );
}
