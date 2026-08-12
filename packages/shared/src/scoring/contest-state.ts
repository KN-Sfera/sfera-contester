export type ContestPhase = "UPCOMING" | "RUNNING" | "FINISHED";

export interface ContestWindow {
  startsAt: Date;
  durationMinutes: number;
}

/**
 * Faza konkursu wyliczana z zegara, nie trzymana w bazie.
 *
 * Kolumna ze statusem wymagałaby zadania cyklicznego i potrafiłaby się rozjechać
 * z rzeczywistością; tu jedynym źródłem prawdy jest czas serwera.
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

/** Sekundy do końca konkursu; 0 po zakończeniu. Zegar liczy serwer. */
export function secondsRemaining(
  window: ContestWindow,
  now: Date = new Date(),
): number {
  const left = contestEndsAt(window).getTime() - now.getTime();
  return Math.max(0, Math.floor(left / 1000));
}

/** Sekundy do startu; 0 gdy konkurs już ruszył. */
export function secondsUntilStart(
  window: ContestWindow,
  now: Date = new Date(),
): number {
  const left = window.startsAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(left / 1000));
}
