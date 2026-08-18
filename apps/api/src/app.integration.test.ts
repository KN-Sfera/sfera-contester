import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { ProblemFile } from "./seed/problem-files.js";
import { seedProblems } from "./seed/problems.js";
import { createFakeProgressBus } from "../test/fake-progress.js";
import { createFakeJudgeQueue } from "../test/fake-queue.js";
import { startTestPostgres, type TestPostgres } from "../test/postgres.js";

const publicProblem: ProblemFile = {
  slug: "z-ukrytymi",
  title: "Problem with hidden tests",
  statement: "Print the sum.",
  timeLimit: 2,
  memoryLimit: 128000,
  testCases: [
    { input: "1 2\n", expectedOutput: "3\n", isSample: true },
    { input: "999999 1\n", expectedOutput: "1000000\n", isSample: false },
    { input: "0 0\n", expectedOutput: "0\n", isSample: true },
    { input: "-5 -5\n", expectedOutput: "-10\n", isSample: false },
  ],
};

let postgres: TestPostgres;
let app: FastifyInstance;

beforeAll(async () => {
  postgres = await startTestPostgres();
  await seedProblems(postgres.handle.db, [publicProblem]);
  // The queue and bus fakes are mandatory — without them buildApp opens a real
  // Redis connection, which hangs in infinite retries when Redis is absent.
  app = await buildApp({
    logger: false,
    database: postgres.handle,
    queue: createFakeJudgeQueue(),
    progressBus: createFakeProgressBus(),
  });
});

afterAll(async () => {
  await app?.close();
  await postgres?.stop();
});

describe("GET /health", () => {
  it("answers ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});

describe("GET /api/problems", () => {
  it("returns a problem with the sample count, not the total test count", async () => {
    const response = await app.inject({ method: "GET", url: "/api/problems" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({ slug: "z-ukrytymi", sampleCount: 2 }),
    ]);
  });
});

describe("GET /api/problems/:slug", () => {
  it("never discloses hidden tests", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/problems/z-ukrytymi",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().testCases).toHaveLength(2);
    // Hidden test inputs and outputs must not leak in any form.
    expect(response.payload).not.toContain("999999");
    expect(response.payload).not.toContain("1000000");
    expect(response.payload).not.toContain("-10");
  });

  it("returns samples in judging order", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/problems/z-ukrytymi",
    });

    expect(
      response.json().testCases.map((testCase: { ordinal: number }) => testCase.ordinal),
    ).toEqual([1, 3]);
  });

  it("returns 404 for an unknown problem", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/problems/nie-ma-takiego",
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("unpublished problems", () => {
  it("appear neither on the list nor under their slug", async () => {
    const { problems } = await import("@sfera/db");
    const { eq } = await import("drizzle-orm");
    await postgres.handle.db
      .update(problems)
      .set({ isPublic: false })
      .where(eq(problems.slug, "z-ukrytymi"));

    const list = await app.inject({ method: "GET", url: "/api/problems" });
    const single = await app.inject({
      method: "GET",
      url: "/api/problems/z-ukrytymi",
    });

    expect(list.json()).toEqual([]);
    expect(single.statusCode).toBe(404);

    await postgres.handle.db
      .update(problems)
      .set({ isPublic: true })
      .where(eq(problems.slug, "z-ukrytymi"));
  });
});

describe("GET /api/languages", () => {
  it("returns the language list without Judge0 ids", async () => {
    const response = await app.inject({ method: "GET", url: "/api/languages" });

    expect(response.statusCode).toBe(200);
    const languages = response.json();
    expect(languages.length).toBeGreaterThan(0);
    expect(languages[0]).not.toHaveProperty("judge0Id");
  });
});

describe("input validation", () => {
  it("returns 400 from POST /api/run with no source", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/run",
      payload: { language: "cpp" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for POST /api/run with an unknown language", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/run",
      payload: { language: "brainfuck", source: "+" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 404 from POST /api/run-samples for an unknown problem", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/run-samples",
      payload: {
        language: "python",
        source: "print(1)",
        problemSlug: "nie-ma-takiego",
      },
    });

    expect(response.statusCode).toBe(404);
  });
});
