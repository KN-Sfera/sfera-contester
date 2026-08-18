"use client";

import { useLayoutEffect, useRef } from "react";
import { DURATION, EASE, motion, set } from "./motion";

/**
 * FLIP — First, Last, Invert, Play.
 *
 * Measures positions before and after a repaint, transforms the element back
 * to where it came from, and lets it travel to its new place. A row "slides"
 * without animating any property that forces layout.
 *
 * It lives here because the Phase 4 leaderboard needs it: on a live update
 * you otherwise cannot see who overtook whom — and that is the only reason
 * people watch a scoreboard.
 */
export function useFlip(keys: readonly string[], duration = DURATION.slow) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const previous = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const moved: HTMLElement[] = [];

    for (const [key, node] of nodes.current) {
      const top = node.getBoundingClientRect().top;
      const before = previous.current.get(key);
      previous.current.set(key, top);

      if (before === undefined) continue;
      const delta = before - top;
      if (Math.abs(delta) < 1) continue;

      set(node, { translateY: delta });
      moved.push(node);
    }

    if (moved.length === 0) return;
    motion(moved, { translateY: 0, duration, ease: EASE.out });
  }, [keys, duration]);

  return (key: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(key, node);
    else nodes.current.delete(key);
  };
}
