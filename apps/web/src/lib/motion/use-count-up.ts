"use client";

import { useEffect, useRef, useState } from "react";
import { DURATION, prefersReducedMotion } from "./motion";

/**
 * A number that travels to its new value instead of jumping.
 *
 * Used by "Test 7/20". A jump from 3 to 7 reads like a glitch; the travel
 * shows that a few tests simply went through quickly.
 */
export function useCountUp(target: number, duration = DURATION.base): number {
  const [value, setValue] = useState(target);
  const frame = useRef<number>(0);
  const from = useRef(target);

  useEffect(() => {
    if (prefersReducedMotion() || from.current === target) {
      from.current = target;
      setValue(target);
      return;
    }

    const start = performance.now();
    const origin = from.current;
    const distance = target - origin;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // easeOutQuad — quick start, soft landing. Matches the entrance curve
      // used everywhere else in the interface.
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(Math.round(origin + distance * eased));
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        from.current = target;
      }
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return value;
}
