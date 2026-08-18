import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { motion, prefersReducedMotion } from "./motion";

/**
 * A hard requirement from the roadmap: under `prefers-reduced-motion` we
 * switch off **motion**, not the state change. Someone with animations
 * disabled should see the result at once, not never.
 *
 * This test is the reason animations go through a facade instead of calling
 * anime.js directly from components.
 */

function reduceMotion(enabled: boolean) {
  globalThis.__mediaMatches = (query: string) =>
    enabled && query.includes("prefers-reduced-motion");
}

let element: HTMLElement;

beforeEach(() => {
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  element.remove();
  vi.restoreAllMocks();
});

describe("prefersReducedMotion", () => {
  it("reads the system preference", () => {
    reduceMotion(true);
    expect(prefersReducedMotion()).toBe(true);

    reduceMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("motion under prefers-reduced-motion", () => {
  beforeEach(() => reduceMotion(true));

  it("applies the final state immediately", () => {
    motion(element, { opacity: [0, 1], translateY: [8, 0] });

    expect(element.style.opacity).toBe("1");
    expect(element.style.transform).toContain("translateY(0px)");
  });

  it("takes the last value of a keyframe sequence", () => {
    motion(element, {
      opacity: [
        { to: 1, duration: 100 },
        { to: 0, duration: 100 },
      ],
    });

    expect(element.style.opacity).toBe("0");
  });

  it("still calls onComplete so post-animation logic does not stall", () => {
    const onComplete = vi.fn();
    motion(element, { opacity: 1, onComplete });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does not try to set playback keys as properties", () => {
    motion(element, { opacity: 1, duration: 300, ease: "outQuint" });
    expect(element.style.cssText).not.toContain("duration");
  });
});

describe("motion without motion restrictions", () => {
  beforeEach(() => reduceMotion(false));

  it("returns a handle that can interrupt the animation", () => {
    const handle = motion(element, { opacity: [0, 1], duration: 500 });
    expect(() => handle.cancel()).not.toThrow();
  });

  it("shouts about properties that force layout", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // `width` and `height` wreck smoothness on weaker hardware, and finding
    // that out in the contest hall is useless.
    motion(element, { width: 100 } as never);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("width"));
  });
});
