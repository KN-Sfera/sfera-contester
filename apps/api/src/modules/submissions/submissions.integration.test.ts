import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { ProblemFile } from "../../seed/problem-files.js";
import { seedProblems } from "../../seed/problems.js";
import { createFakeProgressBus } from "../../../test/fake-progress.js";
import {
  createFakeJudgeQueue,
  type FakeJudgeQueue,
} from "../../../test/fake-queue.js";
import { startTestPostgres, type TestPostgres } from "../../../test/postgres.js";

const problem: ProblemFile = {
  slug: "submit-test",
  title: "A + B",
  statement: "Wypisz sumę.",
  timeLimit: 2,
  memoryLimit: 128000,
  testCases: [
    { input: "1 2\n", expectedOutput: "3\n", isSample: true },
    { input: "9 9\n", expectedOutput: "18\n", isSample: false },
  ],
};

const USER = {
  email: "submitujacy@example.com",
  password: "bardzo-tajne-haslo",
  displayName: "Submitujący",
};

let postgres: TestPostgres;
let queue: FakeJudgeQueue;
let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  postgres = await startTestPostgres();
  await seedProblems(postgres.handle.db, [problem]);
  queue = createFakeJudgeQueue();
  app = await buildApp({
    logger: false,
    database: postgres.handle,
    queue,
    progressBus: createFakeProgressBus(),
  });

  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: USER,
  });
  const session = registered.cookies.find(
    (item) => item.name === "sfera_session",
  ) as { value: string };
  cookie = `sfera_session=${session.value}`;
});

beforeEach(() => {
  queue.jobs.length = 0;
});

afterAll(async () => {
  await app?.close();
  await postgres?.stop();
});

async function submit(
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return await app.inject({
    method: "POST",
    url: "/api/submissions",
    payload,
    headers,
  });
}

describe("POST /api/submissions", () => {
  it("bez zalogowania zwraca 401 i nic nie kolejkuje", async () => {
    const response = await submit({
      problemSlug: "submit-test",
      language: "python",
      source: "print(3)",
    });

    expect(response.statusCode).toBe(401);
    expect(queue.jobs).toHaveLength(0);
  });

  it("przyjmuje submit z 202 i wrzuca go do kolejki", async () => {
    const response = await submit(
      {
        problemSlug: "submit-test",
        language: "python",
        source: "print(3)",
      },
      { cookie },
    );

    expect(response.statusCode).toBe(202);
    const { submissionId } = response.json();
    expect(submissionId).toEqual(expect.any(String));
    expect(queue.jobs).toEqual([
      { job: { submissionId }, priority: "submission" },
    ]);
  });

  it("zapisuje submit jako QUEUED bez werdyktu", async () => {
    const created = await submit(
      { problemSlug: "submit-test", language: "cpp", source: "int main(){}" },
      { cookie },
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/submissions/${created.json().submissionId}`,
      headers: { cookie },
    });

    expect(response.json()).toMatchObject({
      status: "QUEUED",
      verdict: null,
      judgedAt: null,
      results: [],
    });
  });

  it("odrzuca nieistniejące zadanie i nic nie kolejkuje", async () => {
    const response = await submit(
      { problemSlug: "nie-ma-takiego", language: "python", source: "print(1)" },
      { cookie },
    );

    expect(response.statusCode).toBe(404);
    expect(queue.jobs).toHaveLength(0);
  });

  it("odrzuca nieznany język", async () => {
    const response = await submit(
      { problemSlug: "submit-test", language: "brainfuck", source: "+" },
      { cookie },
    );

    expect(response.statusCode).toBe(400);
  });

  it("odrzuca pusty kod", async () => {
    const response = await submit(
      { problemSlug: "submit-test", language: "python", source: "" },
      { cookie },
    );

    expect(response.statusCode).toBe(400);
  });
});

describe("GET /api/submissions", () => {
  it("bez zalogowania zwraca 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/submissions",
    });

    expect(response.statusCode).toBe(401);
  });

  it("zwraca historię od najnowszych", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/submissions",
      headers: { cookie },
    });

    const history = response.json();
    expect(history.length).toBeGreaterThan(1);
    const times = history.map((item: { createdAt: string }) =>
      new Date(item.createdAt).getTime(),
    );
    expect([...times].sort((a: number, b: number) => b - a)).toEqual(times);
  });
});

describe("GET /api/submissions/:id", () => {
  it("nie pokazuje cudzych submitów", async () => {
    const created = await submit(
      { problemSlug: "submit-test", language: "python", source: "print(3)" },
      { cookie },
    );

    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "obcy@example.com",
        password: "inne-tajne-haslo",
        displayName: "Obcy",
      },
    });
    const intruder = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "obcy@example.com", password: "inne-tajne-haslo" },
    });
    const intruderSession = intruder.cookies.find(
      (item) => item.name === "sfera_session",
    ) as { value: string };

    const response = await app.inject({
      method: "GET",
      url: `/api/submissions/${created.json().submissionId}`,
      headers: { cookie: `sfera_session=${intruderSession.value}` },
    });

    // To samo 404 co dla nieistniejącego — endpoint nie może być wyrocznią
    // istnienia identyfikatorów.
    expect(response.statusCode).toBe(404);
  });

  it("nie ujawnia stderr ani wyjścia kompilatora z poszczególnych testów", async () => {
    const created = await submit(
      { problemSlug: "submit-test", language: "python", source: "print(3)" },
      { cookie },
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/submissions/${created.json().submissionId}`,
      headers: { cookie },
    });

    // Na ukrytych testach stderr potrafi zdradzić dane wejściowe.
    expect(response.payload).not.toContain("stderr");
    expect(response.payload).not.toContain("compileOutput");
  });
});
