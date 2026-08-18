"use client";

import { useEffect, useRef } from "react";
import { balloonColor } from "@/lib/balloon";
import { DURATION, EASE, motion, set } from "@/lib/motion/motion";
import { useReducedMotion } from "@/lib/motion/use-reduced-motion";

/**
 * The balloon released on an accepted solution.
 *
 * The only animation in this interface allowed to be noticeable — because it
 * marks the only moment people enter contests for. At ICPC a volunteer carries
 * the balloon to your desk; here a balloon in the problem's colour rises and
 * drifts away.
 *
 * The limits are deliberate: once, 1.2 s, `pointer-events: none`, and fired
 * **after** the result is already on screen. An animation must never delay the
 * information.
 *
 * Under `prefers-reduced-motion` we do not draw it at all. The balloon carries
 * no information the verdict banner lacks — without motion it is just a dot,
 * so skipping it beats showing a static one.
 */
export function BalloonRelease({ slug }: { slug: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  // Animates once, on mount. A repeat is forced by the parent through `key` —
  // that is, exactly when a new verdict has arrived.
  useEffect(() => {
    const node = ref.current;
    if (!node || reduced) return;

    set(node, { opacity: 0, translateY: 0, translateX: 0, scale: 0.7 });

    const drift = (Math.random() - 0.5) * 60;
    const handle = motion(node, {
      opacity: [
        { to: 1, duration: 160 },
        { to: 1, duration: 700 },
        { to: 0, duration: 340 },
      ],
      translateY: -220,
      translateX: drift,
      scale: 1,
      duration: DURATION.balloon,
      ease: EASE.out,
    });

    return () => handle.cancel();
  }, [reduced]);

  if (reduced) return null;

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute bottom-2 left-6 size-5 rounded-full opacity-0"
      style={{ background: balloonColor(slug) }}
    />
  );
}
