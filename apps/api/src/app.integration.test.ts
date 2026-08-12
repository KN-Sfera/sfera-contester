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
  title: "Zadanie z ukrytymi testami",
  statement: "Wypisz sumę.",
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
  // Atrapy kolejki i szyny są obowiązkowe — bez nich buildApp otwiera prawdziwe
  // połączenie do Redisa, które przy jego braku wisi w nieskończonych retry.
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
  it("odpowiada ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});

describe("GET /api/problems", () => {
  it("zwraca zadanie z liczbą sampli, nie wszystkich testów", async () => {
    const response = await app.inject({ method: "GET", url: "/api/problems" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({ slug: "z-ukrytymi", sampleCount: 2 }),
    ]);
  });
});

describe("GET /api/problems/:slug", () => {
  it("nie ujawnia ukrytych testów", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/problems/z-ukrytymi",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().testCases).toHaveLength(2);
    // Wejścia i wyjścia testów ukrytych nie mogą przeciec w żadnej formie.
    expect(response.payload).not.toContain("999999");
    expect(response.payload).not.toContain("1000000");
    expect(response.payload).not.toContain("-10");
  });

  it("zwraca sample w kolejności oceniania", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/problems/z-ukrytymi",
    });

    expect(
      response.json().testCases.map((testCase: { ordinal: number }) => testCase.ordinal),
    ).toEqual([1, 3]);
  });

  it("zwraca 404 dla nieznanego zadania", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/problems/nie-ma-takiego",
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("zadania nieopublikowane", () => {
  it("nie pojawiają się na liście ani pod slugiem", async () => {
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
  it("zwraca listę języków bez id Judge0", async () => {
    const response = await app.inject({ method: "GET", url: "/api/languages" });

    expect(response.statusCode).toBe(200);
    const languages = response.json();
    expect(languages.length).toBeGreaterThan(0);
    expect(languages[0]).not.toHaveProperty("judge0Id");
  });
});

describe("walidacja wejścia", () => {
  it("POST /api/run bez source zwraca 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/run",
      payload: { language: "cpp" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("POST /api/run z nieznanym językiem zwraca 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/run",
      payload: { language: "brainfuck", source: "+" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("POST /api/run-samples dla nieznanego zadania zwraca 404", async () => {
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
