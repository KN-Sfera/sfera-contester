import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running stack.
 *
 * They deliberately do not start the backend themselves: judging needs Postgres,
 * Redis and a privileged Judge0, which is `docker compose up`, not something a
 * test runner should own. The web server is ours to start, so Playwright starts
 * that one.
 *
 * Run with:
 *   docker compose up -d          # or the local dev API and worker
 *   npm run test:e2e
 */

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = process.env.E2E_API_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e",
  // Judging goes through a real sandbox; the default 30 s is not enough for a
  // compile plus a queue wait.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // The tests share one account and one problem set, so parallel workers would
  // be racing over the same submission history.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // 375 px is the width the responsive rules were designed against, so it
      // is the width the critical paths have to survive.
      name: "mobile",
      use: { ...devices["iPhone 13"] },
    },
  ],

  webServer: {
    command: `npm run start -w @sfera/web -- --port ${WEB_PORT}`,
    url: WEB_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NEXT_PUBLIC_API_URL: API_URL },
  },
});
