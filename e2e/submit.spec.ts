import {
  ACCEPTED_SOLUTION,
  SEEDED_PROBLEM,
  WRONG_SOLUTION,
  expect,
  requireSeededStack,
  test,
} from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * The path everything else exists to serve: write a solution, submit it, watch
 * it being judged, find it in the history.
 *
 * These tests run against a real Judge0, so they are slow by nature — that is
 * the point. A judging path mocked at the queue would not catch the failures
 * that actually happen here.
 */

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  await requireSeededStack(request);
  await request.dispose();
});

/**
 * Types a solution into whichever editor the viewport chose.
 *
 * Both Monaco and CodeMirror keep the real text in a hidden textarea and
 * repaint the visible layer themselves, so we go through the keyboard rather
 * than `fill()` — that is also closer to what a contestant does.
 */
async function writeSolution(page: Page, source: string): Promise<void> {
  const editor = page.locator(".monaco-editor, .cm-editor").first();
  await expect(editor).toBeVisible({ timeout: 30_000 });

  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  // No auto-indent surprises: the solution is written as one line plus a
  // newline, and neither editor re-indents that.
  await page.keyboard.insertText(source);

  await expect(page.getByText(/\d+ B \/ 64\.0 kB/)).toBeVisible();
}

/** On a narrow viewport the panels are tabs; on a wide one they are columns. */
async function openPanel(page: Page, name: "Statement" | "Code" | "Results"): Promise<void> {
  const tab = page.getByRole("tab", { name });
  if (await tab.isVisible()) await tab.click();
}

test.describe("submitting a solution", () => {
  test("shows live progress and an accepted verdict", async ({ signedIn: page }) => {
    await page.goto(`/problems/${SEEDED_PROBLEM}`);

    await openPanel(page, "Code");
    await writeSolution(page, ACCEPTED_SOLUTION);
    await page.getByRole("button", { name: "Submit" }).click();

    await openPanel(page, "Results");

    // The strip carries its own text equivalent, which is what we assert on —
    // it is the same information a screen reader gets.
    const strip = page.getByRole("img", { name: /tests/ });
    await expect(strip).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole("status")).toContainText("Accepted", {
      timeout: 60_000,
    });
    await expect(strip).toHaveAccessibleName(/All \d+ tests passed\./);
  });

  test("names the failing test on a wrong answer", async ({ signedIn: page }) => {
    await page.goto(`/problems/${SEEDED_PROBLEM}`);

    await openPanel(page, "Code");
    await writeSolution(page, WRONG_SOLUTION);
    await page.getByRole("button", { name: "Submit" }).click();

    await openPanel(page, "Results");

    // Under the ICPC rule judging stops at the first failure, and its number is
    // the only thing the contestant is told.
    await expect(page.getByRole("status")).toContainText(/Wrong answer on test \d+/, {
      timeout: 60_000,
    });
  });

  test("tells an anonymous visitor to sign in rather than failing quietly", async ({ page }) => {
    await page.goto(`/problems/${SEEDED_PROBLEM}`);

    await openPanel(page, "Code");
    await writeSolution(page, ACCEPTED_SOLUTION);
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByText("Sign in to submit a solution.")).toBeVisible();
  });
});

test.describe("history", () => {
  test("carries a submission through to its own page", async ({ signedIn: page }) => {
    await page.goto(`/problems/${SEEDED_PROBLEM}`);
    await openPanel(page, "Code");
    await writeSolution(page, ACCEPTED_SOLUTION);
    await page.getByRole("button", { name: "Submit" }).click();

    await openPanel(page, "Results");
    await expect(page.getByRole("status")).toContainText("Accepted", { timeout: 60_000 });

    await page.goto("/submissions");

    const entry = page.getByRole("link", { name: /A \+ B/ }).first();
    await expect(entry).toBeVisible();
    await entry.click();

    await expect(page).toHaveURL(/\/submissions\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("status")).toContainText("Accepted");
    // The source is shown read-only, so a contestant can see what they sent.
    await expect(page.getByText("Code", { exact: true })).toBeVisible();
  });

  test("starts empty for a fresh account", async ({ signedIn: page }) => {
    await page.goto("/submissions");

    await expect(page.getByText("You have not submitted anything yet")).toBeVisible();
  });
});

test.describe("running the samples", () => {
  test("works without an account and shows the program's output", async ({ page }) => {
    // Samples are public, so trying a problem needs no sign-up. This is the one
    // path an unregistered visitor can walk end to end.
    await page.goto(`/problems/${SEEDED_PROBLEM}`);

    await openPanel(page, "Code");
    await writeSolution(page, ACCEPTED_SOLUTION);
    await page.getByRole("button", { name: "Samples" }).click();

    await openPanel(page, "Results");
    await expect(page.getByText("Your output").first()).toBeVisible({ timeout: 60_000 });
  });
});
