export type ContestPhase = "UPCOMING" | "RUNNING" | "FINISHED";

export interface ContestWindow {
  startsAt: Date;
  durationMinutes: number;
}

/**
 * The contest phase, derived from the clock rather than stored.
 *
 * A status column would need a scheduled job and could drift out of step with
 * reality; here the only source of truth is the server's clock.
 */
export function contestPhase(
  window: ContestWindow,
  now: Date = new Date(),
): ContestPhase {
  const start = window.startsAt.getTime();
  const end = start + window.durationMinutes * 60_000;
  const at = now.getTime();

  if (at < start) return "UPCOMING";
  if (at < end) return "RUNNING";
  return "FINISHED";
}

export function contestEndsAt(window: ContestWindow): Date {
  return new Date(window.startsAt.getTime() + window.durationMinutes * 60_000);
}

/** Seconds left in the contest; 0 once it is over. The server keeps time. */
export function secondsRemaining(
  window: ContestWindow,
  now: Date = new Date(),
): number {
  const left = contestEndsAt(window).getTime() - now.getTime();
  return Math.max(0, Math.floor(left / 1000));
}

/** Seconds until the start; 0 once the contest is under way. */
export function secondsUntilStart(
  window: ContestWindow,
  now: Date = new Date(),
): number {
  const left = window.startsAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(left / 1000));
}
