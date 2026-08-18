import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Verdict } from "@sfera/shared";
import { TestStrip } from "./test-strip";

/**
 * The strip is the main carrier of progress, so its screen-reader description
 * has to hold exactly the same information as the cells. Colour can never be
 * the only channel.
 */
describe("TestStrip", () => {
  const ac: Verdict = "AC";

  it("draws one cell per test", () => {
    const { container } = render(<TestStrip total={20} results={[]} />);
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(20);
  });

  it("describes the state before judging starts", () => {
    render(<TestStrip total={20} results={[]} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("No tests judged out of 20.");
  });

  it("describes progress mid-run", () => {
    render(<TestStrip total={20} results={[ac, ac, ac]} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("3 of 20 tests passed.");
  });

  it("names the test judging stopped on", () => {
    // ICPC rule: we stop at the first failure, and its number is the only
    // information the contestant gets.
    render(<TestStrip total={20} results={[ac, ac, "WA"]} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Judging stopped at test 3 of 20: WA.",
    );
  });

  it("reports a clean sweep", () => {
    render(<TestStrip total={3} results={[ac, ac, ac]} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("All 3 tests passed.");
  });

  it("does not drop results that outnumber the announced total", () => {
    // `total` comes from the `started` event; if it never arrived, the strip
    // still has to show everything that did.
    const { container } = render(<TestStrip total={0} results={[ac, ac]} />);
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(2);
  });
});
