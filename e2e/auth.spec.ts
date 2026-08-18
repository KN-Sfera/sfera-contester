import { expect, requireSeededStack, test } from "./fixtures";

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  await requireSeededStack(request);
  await request.dispose();
});

test.describe("signing in", () => {
  test("takes an account through the form to the problem list", async ({ page, account }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/problems$/);
    // The display name in the header is the proof the session is live, not
    // merely that the redirect fired.
    await expect(page.getByText(account.displayName).first()).toBeVisible();
  });

  test("keeps a wrong password on the sign-in page with a message", async ({ page, account }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("sends an anonymous visitor from history to sign-in and back again", async ({
    page,
    account,
  }) => {
    await page.goto("/submissions");

    // The protected page redirects with `next`, so signing in returns you to
    // where you were headed.
    await expect(page).toHaveURL(/\/login\?next=%2Fsubmissions/);

    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/submissions$/);
  });

  test("signing out ends the session", async ({ signedIn: page, account }) => {
    await page.goto("/problems");
    await expect(page.getByText(account.displayName).first()).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login/);
    await page.goto("/submissions");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("the problem list", () => {
  test("is readable without an account", async ({ page }) => {
    // The list is public on purpose — you can look at the problems before
    // deciding to sign up.
    await page.goto("/problems");

    await expect(page.getByRole("heading", { name: "Problems", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /A \+ B/ })).toBeVisible();
  });

  test("filters down to nothing and says so", async ({ page }) => {
    await page.goto("/problems");

    await page.getByLabel("Search").fill("zzzz-no-such-problem");

    await expect(page.getByText("Nothing matches")).toBeVisible();
  });
});
