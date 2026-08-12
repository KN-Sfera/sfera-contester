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
  statement: "Wypisz sumę.",
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
      password: "bardzo-tajne-haslo",
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

/** Czeka, aż strumień faktycznie się podłączy, zanim wypuścimy zdarzenia. */
async function waitForSubscriber(): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (progressBus.subscriberCount() > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Strumień się nie podłączył");
}

describe("GET /api/submissions/:id/events", () => {
  it("bez zalogowania zwraca 401", async () => {
    const submissionId = await createSubmission();

    const response = await openStream(submissionId, {});

    expect(response.statusCode).toBe(401);
  });

  it("cudzy submit zwraca 404", async () => {
    const submissionId = await createSubmission();

    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "podgladacz@example.com",
        password: "inne-tajne-haslo",
        displayName: "Podglądacz",
      },
    });
    const intruder = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "podgladacz@example.com", password: "inne-tajne-haslo" },
    });
    const session = intruder.cookies.find(
      (item) => item.name === "sfera_session",
    ) as { value: string };

    const response = await openStream(submissionId, {
      cookie: `sfera_session=${session.value}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it("przekazuje zdarzenia postępu i zamyka strumień po werdykcie", async () => {
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

  it("zwalnia subskrypcję po zamknięciu strumienia", async () => {
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

    // Bez tego każde odświeżenie strony zostawiałoby wiszące połączenie Redisa.
    expect(progressBus.subscriberCount()).toBe(0);
  });

  it("submit oceniony przed podłączeniem od razu dostaje werdykt", async () => {
    const submissionId = await createSubmission();
    await postgres.handle.db
      .update(submissions)
      .set({ status: "DONE", verdict: "WA", failedTestOrdinal: 2 })
      .where(eq(submissions.id, submissionId));

    // Żadne zdarzenie już nie przyjdzie — strumień musi odtworzyć stan z bazy,
    // zamiast wisieć w nieskończoność.
    const response = await openStream(submissionId, { cookie });

    expect(response.payload).toContain("event: done");
    expect(response.payload).toContain('"verdict":"WA"');
    expect(response.payload).toContain('"failedTestOrdinal":2');
  });

  it("submit z błędem infrastruktury zamyka strumień zdarzeniem failed", async () => {
    const submissionId = await createSubmission();
    await postgres.handle.db
      .update(submissions)
      .set({ status: "FAILED", errorMessage: "Judge0 nieosiągalny" })
      .where(eq(submissions.id, submissionId));

    const response = await openStream(submissionId, { cookie });

    expect(response.payload).toContain("event: failed");
  });
});
