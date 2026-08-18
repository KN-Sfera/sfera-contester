"use client";

import { useMediaQuery } from "@/lib/media";

/**
 * The user's motion preference, as React state.
 *
 * For JS-driven animations `prefersReducedMotion()` from the facade is enough;
 * this hook is for components that have to render something different — for
 * example skip the balloon entirely rather than draw a motionless one.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)").matches;
}
