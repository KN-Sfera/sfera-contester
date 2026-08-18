"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "sfera-theme";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
} | null>(null);

/**
 * The ink/paper theme.
 *
 * The initial value is read from the `data-theme` attribute the `<head>`
 * script has already set — so React never overwrites the user's choice with
 * the dark default, and there is no flash on load.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === "light" || current === "dark") setTheme(current);
  }, []);

  const toggle = useCallback(() => {
    setTheme((previous) => {
      const next: Theme = previous === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private browsing blocks the write. The theme still works until the
        // next reload — better than a toggle that throws.
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme requires a ThemeProvider.");
  return value;
}
