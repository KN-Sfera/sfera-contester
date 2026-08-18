import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

/**
 * jsdom does not implement `matchMedia`, and without it neither responsive
 * behaviour nor `prefers-reduced-motion` handling can be tested — the two
 * things this project treats as hard requirements.
 */
declare global {
  // eslint-disable-next-line no-var
  var __mediaMatches: (query: string) => boolean;
}

globalThis.__mediaMatches = () => false;

beforeEach(() => {
  globalThis.__mediaMatches = () => false;

  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList =>
      ({
        matches: globalThis.__mediaMatches(query),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
