import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerdictBadge } from "./verdict-badge";

describe("VerdictBadge", () => {
  it("shows the abbreviation but leaves the expansion for screen readers", () => {
    // The abbreviation is the language of the scoreboard and has to stay. On
    // its own, though, it is a barrier for anyone at their first contest.
    render(<VerdictBadge verdict="WA" />);
    const badge = screen.getByText("WA");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Wrong answer");
  });

  it("shows the judging status when there is no verdict yet", () => {
    render(<VerdictBadge verdict={null} status="RUNNING" />);
    expect(screen.getByText("Judging")).toBeInTheDocument();
  });

  it("does not let a queued submission pose as a result", () => {
    render(<VerdictBadge verdict={null} status="QUEUED" />);
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });

  it("tells a judging failure apart from a wrong answer", () => {
    // A failure on our side is not the solution's fault and must not look
    // like a verdict.
    render(<VerdictBadge verdict={null} status="FAILED" />);
    expect(screen.getByText("Not judged")).toBeInTheDocument();
  });
});
