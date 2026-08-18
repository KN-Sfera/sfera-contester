"use client";

import { useEffect, useRef } from "react";
import { DURATION, EASE, motion, set, stagger } from "./motion";

/**
 * A cascading entrance for a group of elements.
 *
 * Not decoration: on the problem list the solved states arrive from a
 * different request than the list itself, so there is a real phase during
 * which the balloon column fills in. The cascade shows that moment instead of
 * hiding it.
 *
 * `active` controls the trigger — the animation runs once, when the data lands.
 */
export function useEnter<T extends HTMLElement>(
  active: boolean,
  selector: string,
): React.RefObject<T | null> {
  const container = useRef<T>(null);
  const played = useRef(false);

  useEffect(() => {
    if (!active || played.current || !container.current) return;
    played.current = true;

    const targets = container.current.querySelectorAll(selector);
    if (targets.length === 0) return;

    set(targets, { opacity: 0, translateY: 4 });
    motion(targets, {
      opacity: 1,
      translateY: 0,
      duration: DURATION.base,
      ease: EASE.out,
      delay: stagger(18),
    });
  }, [active, selector]);

  return container;
}
