import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Shared fixtures for the end-to-end tests.
 *
 * Accounts are created through the API rather than through the sign-up form.
 * The form has its own test; everywhere else account creation is setup, and
 * setup should be fast and immune to changes in the sign-up screen.
 */

const API_URL = process.env.E2E_API_URL ?? "http://localhost:3001";

/** The problem the submission tests rely on. Comes from `npm run seed:problems`. */
export const SEEDED_PROBLEM = "a-plus-b";

export const ACCEPTED_SOLUTION = `#include <iostream>
int main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<std::endl;}
`;

/** Compiles, runs, and prints the wrong answer — a reliable WA. */
export const WRONG_SOLUTION = `#include <iostream>
int main(){long long a,b;std::cin>>a>>b;std::cout<<a-b<<std::endl;}
`;

export interface Account {
  email: string;
  password: string;
  displayName: string;
}

function newAccount(): Account {
  // A unique address per run, so the suite can be run repeatedly against one
  // database without colliding on the unique index.
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    email: `e2e-${id}@example.test`,
    password: "e2e-fixture-password",
    displayName: `E2E ${id.slice(-6)}`,
  };
}

async function register(request: APIRequestContext, account: Account): Promise<void> {
  const response = await request.post(`${API_URL}/api/auth/register`, {
    data: account,
  });

  if (response.status() === 403) {
    throw new Error(
      "Registration is closed (REGISTRATION_MODE). Set it to `open` for the e2e run.",
    );
  }
  expect(
    response.status(),
    `could not create the test account: ${await response.text()}`,
  ).toBe(201);
}

export const test = base.extend<{
  account: Account;
  /** A page with an active session — the cookie is set through the API. */
  signedIn: Page;
}>({
  account: async ({ playwright }, use) => {
    const account = newAccount();
    const request = await playwright.request.newContext();
    await register(request, account);
    await request.dispose();
    await use(account);
  },

  signedIn: async ({ page, account }, use) => {
    // `page.request` shares the browser context's cookie jar, so signing in
    // this way leaves the page genuinely authenticated.
    const response = await page.request.post(`${API_URL}/api/auth/login`, {
      data: { email: account.email, password: account.password },
    });
    expect(response.ok(), "could not sign the fixture account in").toBe(true);
    await use(page);
  },
});

export { expect };

/** Fails with a readable message when the stack is not ready for the suite. */
export async function requireSeededStack(request: APIRequestContext): Promise<void> {
  let response;
  try {
    response = await request.get(`${API_URL}/api/problems`);
  } catch (error) {
    throw new Error(
      `The API is not answering on ${API_URL}. Run \`docker compose up -d\` first. (${String(error)})`,
    );
  }

  expect(response.ok(), `GET /api/problems returned ${response.status()}`).toBe(true);
  const problems = (await response.json()) as { slug: string }[];
  expect(
    problems.some((problem) => problem.slug === SEEDED_PROBLEM),
    `no ${SEEDED_PROBLEM} problem — run \`npm run seed:problems\``,
  ).toBe(true);
}
