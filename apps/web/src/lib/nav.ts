/**
 * The main navigation.
 *
 * Kept out of the header component so the set of tabs — and the rule for
 * which one is current — can be tested without rendering a router.
 */

export interface NavLink {
  href: string;
  label: string;
  /** Shown as a tag next to the label: the tab exists, the screen does not yet. */
  soon?: boolean;
}

export const NAV_LINKS: readonly NavLink[] = [
  { href: "/", label: "Run" },
  { href: "/problems", label: "Problems" },
  { href: "/contests", label: "Contests", soon: true },
  { href: "/submissions", label: "History" },
] as const;

/**
 * `/` is current only for itself — a prefix match would light it up on every
 * page. Everything else matches the section, so `/problems/sum-of-two` still
 * marks "Problems".
 */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
