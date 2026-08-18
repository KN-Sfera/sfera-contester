/**
 * Balloons.
 *
 * At ICPC every problem is assigned a balloon colour — solve it and a
 * volunteer brings the balloon to your desk. Here the colour plays the same
 * role: it is the problem's identity, constant across every view, so you can
 * recognise a problem without reading its title.
 *
 * The colour comes from the slug, not from the position in the list — the
 * position changes with filtering and sorting, and then "the green problem"
 * would stop meaning anything.
 */

export const BALLOON_COUNT = 12;

/** Problem letter in ICPC style: A, B, ... Z, AA, AB. */
export function problemLetter(index: number): string {
  if (index < 0) return "?";
  let n = index;
  let letter = "";
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

/**
 * FNV-1a. We need spread and repeatability, not cryptographic strength — and
 * this has to behave identically on the server and in the client, otherwise
 * hydration reports a mismatch.
 */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function balloonIndex(slug: string): number {
  return hash(slug) % BALLOON_COUNT;
}

/** CSS variable holding the balloon ink — the value is theme-dependent, so not a hex. */
export function balloonColor(slug: string): string {
  return `var(--balloon-${balloonIndex(slug)})`;
}
