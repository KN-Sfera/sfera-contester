import { animate, utils, type AnimationParams } from "animejs";

/**
 * Facade over anime.js.
 *
 * Components never call `animate()` directly. The reason is concrete: the
 * roadmap sets three hard requirements — respect `prefers-reduced-motion`,
 * animate only `transform` and `opacity`, and never block interaction.
 * Meeting them in one module is testable; scattered across thirty components
 * it is not.
 *
 * Under `reduce` the **final state is applied immediately**. We switch off
 * motion, not state changes — someone with animations disabled should see the
 * result at once, not never.
 */

/** Properties we allow. Everything else forces layout. */
const ALLOWED = new Set([
  "opacity",
  "translateX",
  "translateY",
  "translateZ",
  "scale",
  "scaleX",
  "scaleY",
  "rotate",
  "rotateX",
  "rotateY",
  "skewX",
  "skewY",
  "filter",
]);

/** Playback keys — not animatable properties. */
const CONTROL_KEYS = new Set([
  "duration",
  "delay",
  "ease",
  "easing",
  "loop",
  "alternate",
  "autoplay",
  "composition",
  "onComplete",
  "onBegin",
  "onUpdate",
  "onLoop",
  "playbackEase",
  "reversed",
  "loopDelay",
  "frameRate",
  "playbackRate",
]);

export const DURATION = {
  fast: 140,
  base: 240,
  slow: 520,
  balloon: 1200,
} as const;

export const EASE = {
  out: "outQuint",
  in: "inQuad",
  inOut: "inOutQuad",
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Targets = Parameters<typeof animate>[0];

/**
 * The value the animation should settle on.
 *
 * Unwraps recursively, because a keyframe sequence is an array of objects
 * (`[{ to: 1, duration: 160 }, { to: 0, duration: 340 }]`) — without going one
 * level deeper, `utils.set` would receive the whole keyframe object.
 */
function finalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length > 0 ? finalValue(value[value.length - 1]) : undefined;
  }
  if (value && typeof value === "object" && "to" in value) {
    return finalValue((value as { to: unknown }).to);
  }
  return value;
}

function assertAnimatable(params: AnimationParams): void {
  if (process.env.NODE_ENV === "production") return;
  for (const key of Object.keys(params)) {
    if (CONTROL_KEYS.has(key) || ALLOWED.has(key)) continue;
    // Deliberately loud: animating width/height/top ruins smoothness on
    // weaker hardware, and finding that out in the contest hall is useless.
    console.error(
      `[motion] "${key}" forces layout. Only transform, opacity and filter are allowed.`,
    );
  }
}

export interface MotionHandle {
  cancel(): void;
}

const NOOP_HANDLE: MotionHandle = { cancel() {} };

/**
 * Animates a target — or, under `reduce`, applies the final state at once.
 * Returns a handle so an animation can be interrupted when the state changes
 * again (a new submission while the previous one is still animating).
 */
export function motion(targets: Targets, params: AnimationParams): MotionHandle {
  assertAnimatable(params);

  if (prefersReducedMotion()) {
    const settled: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (CONTROL_KEYS.has(key)) continue;
      settled[key] = finalValue(value);
    }
    if (Object.keys(settled).length > 0) {
      utils.set(targets, settled as AnimationParams);
    }
    // Called with no argument — under `reduce` there is no animation instance,
    // and our callbacks never use it anyway.
    (params.onComplete as unknown as (() => void) | undefined)?.();
    return NOOP_HANDLE;
  }

  const animation = animate(targets, {
    duration: DURATION.base,
    ease: EASE.out,
    ...params,
  });

  return {
    cancel() {
      animation.pause();
    },
  };
}

/** Sets properties without animating — the starting state before an entrance. */
export function set(targets: Targets, props: Record<string, unknown>): void {
  utils.set(targets, props as Parameters<typeof utils.set>[1]);
}

export { stagger } from "animejs";
