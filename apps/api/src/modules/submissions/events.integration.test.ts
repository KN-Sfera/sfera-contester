import { eq } from "drizzle-orm";
import { submissions } from "@sfera/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { ProblemFile } from "../../seed/problem-files.js";
import { seedProblems } from "../../seed/problems.js";
import {
  createFakeProgressBus,
  type FakeProgressBus,
} from "../../../test/fake-progress.js";
import { createFakeJudgeQueue } from "../../../test/fake-queue.js";
import { startTestPostgres, type TestPostgres } from "../../../test/postgres.js";

const problem: ProblemFile = {
  slug: "sse-test",
  title: "A + B",
  statement: "Print the sum.",
  timeLimit: 2,
  memoryLimit: 128000,
  testCases: [
    { input: "1 2\n", expectedOutput: "3\n", isSample: true },
    { input: "9 9\n", expectedOutput: "18\n", isSample: false },
  ],
};

let postgres: TestPostgres;
let progressBus: FakeProgressBus;
let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  postgres = await startTestPostgres();
  await seedProblems(postgres.handle.db, [problem]);
  progressBus = createFakeProgressBus();
  app = await buildApp({
    logger: false,
    database: postgres.handle,
    queue: createFakeJudgeQueue(),
    progressBus,
  });

  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "sse@example.com",
      password: "integration-test-password",
      displayName: "SSE",
    },
  });
  const session = registered.cookies.find(
    (item) => item.name === "sfera_session",
  ) as { value: string };
  cookie = `sfera_session=${session.value}`;
});

afterAll(async () => {
  await app?.close();
  await postgres?.stop();
});

async function createSubmission(): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/submissions",
    payload: { problemSlug: "sse-test", language: "python", source: "print(3)" },
    headers: { cookie },
  });
  return response.json().submissionId as string;
}

function openStream(submissionId: string, headers: Record<string, string>) {
  return app.inject({
    method: "GET",
    url: `/api/submissions/${submissionId}/events`,
    headers,
  });
}

/** Waits for the stream to actually connect before we emit any events. */
async function waitForSubscriber(): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (progressBus.subscriberCount() > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("The stream never connected");
}

describe("GET /api/submissions/:id/events", () => {
  it("returns 401 without a session", async () => {
    const submissionId = await createSubmission();

    const response = await openStream(submissionId, {});

    expect(response.statusCode).toBe(401);
  });

  it("returns 404 for another user's submission", async () => {
    const submissionId = await createSubmission();

    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "watcher@example.com",
        password: "other-test-password",
        displayName: "Watcher",
      },
    });
    const intruder = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "watcher@example.com", password: "other-test-password" },
    });
    const session = intruder.cookies.find(
      (item) => item.name === "sfera_session",
    ) as { value: string };

    const response = await openStream(submissionId, {
      cookie: `sfera_session=${session.value}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it("forwards progress events and closes the stream after the verdict", async () => {
    const submissionId = await createSubmission();

    const streamPromise = openStream(submissionId, { cookie });
    await waitForSubscriber();

    await progressBus.publish({ type: "started", submissionId, totalTests: 2 });
    await progressBus.publish({
      type: "test",
      submissionId,
      ordinal: 1,
      totalTests: 2,
      verdict: "AC",
    });
    await progressBus.publish({
      type: "done",
      submissionId,
      verdict: "AC",
      failedTestOrdinal: null,
    });

    const response = await streamPromise;

    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.payload).toContain("event: started");
    expect(response.payload).toContain("event: test");
    expect(response.payload).toContain("event: done");
    expect(response.payload).toContain('"ordinal":1');
  });

  it("releases the subscription once the stream closes", async () => {
    const submissionId = await createSubmission();

    const streamPromise = openStream(submissionId, { cookie });
    await waitForSubscriber();
    await progressBus.publish({
      type: "done",
      submissionId,
      verdict: "AC",
      failedTestOrdinal: null,
    });
    await streamPromise;

    // Without this every page refresh would leave a dangling Redis connection.
    expect(progressBus.subscriberCount()).toBe(0);
  });

  it("delivers the verdict at once for a submission judged before connecting", async () => {
    const submissionId = await createSubmission();
    await postgres.handle.db
      .update(submissions)
      .set({ status: "DONE", verdict: "WA", failedTestOrdinal: 2 })
      .where(eq(submissions.id, submissionId));

    // No event will ever arrive — the stream has to replay the state from the
    // database instead of hanging forever.
    const response = await openStream(submissionId, { cookie });

    expect(response.payload).toContain("event: done");
    expect(response.payload).toContain('"verdict":"WA"');
    expect(response.payload).toContain('"failedTestOrdinal":2');
  });

  it("closes the stream with a failed event on an infrastructure error", async () => {
    const submissionId = await createSubmission();
    await postgres.handle.db
      .update(submissions)
      .set({ status: "FAILED", errorMessage: "Judge0 unreachable" })
      .where(eq(submissions.id, submissionId));

    const response = await openStream(submissionId, { cookie });

    expect(response.payload).toContain("event: failed");
  });
});
