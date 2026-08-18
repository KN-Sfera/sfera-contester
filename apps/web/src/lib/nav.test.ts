import { describe, expect, it } from "vitest";
import { isCurrent, NAV_LINKS } from "./nav";

describe("isCurrent", () => {
  it("marks the home tab only on the home path", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/problems", "/")).toBe(false);
  });

  it("marks a section from its own path and its children", () => {
    expect(isCurrent("/problems", "/problems")).toBe(true);
    expect(isCurrent("/problems/sum-of-two", "/problems")).toBe(true);
  });

  it("does not match a section on a merely similar prefix", () => {
    expect(isCurrent("/problems-archive", "/problems")).toBe(false);
  });

  it("never marks two tabs at once", () => {
    for (const pathname of ["/", "/problems", "/problems/x", "/contests", "/submissions/abc"]) {
      const current = NAV_LINKS.filter((link) => isCurrent(pathname, link.href));
      expect(current).toHaveLength(1);
    }
  });
});
