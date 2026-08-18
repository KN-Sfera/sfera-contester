import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { hashPassword } from "../auth/password.js";
import { createUser } from "../auth/repository.js";
import { createFakeJudge0, type FakeJudge0 } from "../../../test/fake-judge0.js";
import { createFakeProgressBus } from "../../../test/fake-progress.js";
import { createFakeJudgeQueue } from "../../../test/fake-queue.js";
import { startTestPostgres, type TestPostgres } from "../../../test/postgres.js";

const SOLUTION = { language: "python", source: "print(3)" };

let postgres: TestPostgres;
let judge0: FakeJudge0;
let app: FastifyInstance;
let adminCookie: string;
let userCookie: string;

async function loginAs(email: string, password: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password },
  });
  const session = response.cookies.find(
    (item) => item.name === "sfera_session",
  ) as { value: string };
  return `sfera_session=${session.value}`;
}

beforeAll(async () => {
  postgres = await startTestPostgres();
  judge0 = createFakeJudge0();
  app = await buildApp({
    logger: false,
    database: postgres.handle,
    queue: createFakeJudgeQueue(),
    progressBus: createFakeProgressBus(),
    judge0,
  });

  await createUser(postgres.handle.db, {
    email: "admin@example.com",
    passwordHash: await hashPassword("integration-test-password"),
    displayName: "Admin",
    role: "ADMIN",
  });
  await createUser(postgres.handle.db, {
    email: "regular@example.com",
    passwordHash: await hashPassword("integration-test-password"),
    displayName: "Regular",
  });

  adminCookie = await loginAs("admin@example.com", "integration-test-password");
  userCookie = await loginAs("regular@example.com", "integration-test-password");
});

beforeEach(() => {
  judge0.script([]);
});

afterAll(async () => {
  await app?.close();
  await postgres?.stop();
});

async function createProblem(slug: string) {
  return app.inject({
    method: "POST",
    url: "/api/admin/problems",
    headers: { cookie: adminCookie },
    payload: {
      slug,
      title: "A + B",
      statement: "Print the sum.",
      timeLimit: 2,
      memoryLimit: 128000,
    },
  });
}

async function setTestCases(slug: string, count = 3) {
  return app.inject({
    method: "PUT",
    url: `/api/admin/problems/${slug}/test-cases`,
    headers: { cookie: adminCookie },
    payload: {
      testCases: Array.from({ length: count }, (_, index) => ({
        input: `${index} ${index}\n`,
        expectedOutput: `${index * 2}\n`,
        isSample: index === 0,
      })),
    },
  });
}

describe("access control", () => {
  it("returns 401 without a session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/problems",
    });

    expect(response.statusCode).toBe(401);
  });

  it("gives a regular user a 403", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/problems",
      headers: { cookie: userCookie },
    });

    expect(response.statusCode).toBe(403);
  });

  it("does not let a regular user create problems", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problems",
      headers: { cookie: userCookie },
      payload: { slug: "hack", title: "X", statement: "Y" },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("creating a problem", () => {
  it("creates a new problem as a draft, never self-published", async () => {
    const response = await createProblem("new-problem");

    expect(response.statusCode).toBe(201);
    expect(response.json().isPublic).toBe(false);
  });

  it("keeps a draft off the public list", async () => {
    const response = await app.inject({ method: "GET", url: "/api/problems" });

    expect(response.json()).toEqual([]);
  });

  it("rejects a slug that is taken", async () => {
    const response = await createProblem("new-problem");

    expect(response.statusCode).toBe(409);
  });

  it("rejects a slug with capitals and spaces", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problems",
      headers: { cookie: adminCookie },
      payload: { slug: "Bad Slug", title: "X", statement: "Y" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("problem tests", () => {
  it("numbers tests from 1 in the order given", async () => {
    await setTestCases("nowe-zadanie", 3);

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/problems/nowe-zadanie",
      headers: { cookie: adminCookie },
    });

    expect(
      response.json().testCases.map((tc: { ordinal: number }) => tc.ordinal),
    ).toEqual([1, 2, 3]);
  });

  it("lets an admin see full test contents, hidden ones included", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/problems/nowe-zadanie",
      headers: { cookie: adminCookie },
    });

    const hidden = response
      .json()
      .testCases.find((tc: { isSample: boolean }) => !tc.isSample);
    expect(hidden.input).toBeTruthy();
    expect(hidden.expectedOutput).toBeTruthy();
  });

  it("keeps test ids across a rewrite", async () => {
    const before = await app.inject({
      method: "GET",
      url: "/api/admin/problems/nowe-zadanie",
      headers: { cookie: adminCookie },
    });

    await setTestCases("nowe-zadanie", 3);

    const after = await app.inject({
      method: "GET",
      url: "/api/admin/problems/nowe-zadanie",
      headers: { cookie: adminCookie },
    });

    // Otherwise submission history would lose its link to the tests on every edit.
    expect(after.json().testCases.map((tc: { id: string }) => tc.id)).toEqual(
      before.json().testCases.map((tc: { id: string }) => tc.id),
    );
  });

  it("deletes tests missing from the new set", async () => {
    await setTestCases("nowe-zadanie", 2);

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/problems/nowe-zadanie",
      headers: { cookie: adminCookie },
    });

    expect(response.json().testCases).toHaveLength(2);
  });
});

describe("publishing with reference validation", () => {
  it("runs the reference solution through every test and publishes", async () => {
    await setTestCases("nowe-zadanie", 3);

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problems/nowe-zadanie/publish",
      headers: { cookie: adminCookie },
      payload: SOLUTION,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().published).toBe(true);
    expect(judge0.calls).toHaveLength(3);
  });

  it("makes a problem publicly visible once published", async () => {
    const response = await app.inject({ method: "GET", url: "/api/problems" });

    expect(response.json()).toEqual([
      expect.objectContaining({ slug: "nowe-zadanie" }),
    ]);
  });

  it("refuses to publish when the reference solution fails", async () => {
    await app.inject({
      method: "POST",
      url: "/api/admin/problems/nowe-zadanie/unpublish",
      headers: { cookie: adminCookie },
    });
    judge0.script(["AC", "WA", "AC"]);

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problems/nowe-zadanie/publish",
      headers: { cookie: adminCookie },
      payload: SOLUTION,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().published).toBe(false);

    const list = await app.inject({ method: "GET", url: "/api/problems" });
    expect(list.json()).toEqual([]);
  });

  it("does not stop at the first failure — an admin sees every problem", async () => {
    judge0.script(["WA", "AC", "TLE"]);

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problems/nowe-zadanie/validate",
      headers: { cookie: adminCookie },
      payload: SOLUTION,
    });

    const body = response.json();
    expect(body.passed).toBe(false);
    expect(body.results).toHaveLength(3);
    expect(body.results.map((r: { verdict: string }) => r.verdict)).toEqual([
      "WA",
      "AC",
      "TLE",
    ]);
  });

  it("shows expected and actual output only for the tests that failed", async () => {
    judge0.script(["AC", "WA"]);

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problems/nowe-zadanie/validate",
      headers: { cookie: adminCookie },
      payload: SOLUTION,
    });

    const [passed, failed] = response.json().results;
    expect(passed.expectedOutput).toBeUndefined();
    expect(failed.expectedOutput).toBeTruthy();
    expect(failed.actualOutput).toBe("zle-wyjscie");
  });

  it("refuses to publish a problem with no tests", async () => {
    await createProblem("bez-testow");

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problems/bez-testow/publish",
      headers: { cookie: adminCookie },
      payload: SOLUTION,
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 404 for a missing problem", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problems/nie-ma/publish",
      headers: { cookie: adminCookie },
      payload: SOLUTION,
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("deleting", () => {
  it("deletes a problem together with its tests", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/admin/problems/bez-testow",
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(204);

    const check = await app.inject({
      method: "GET",
      url: "/api/admin/problems/bez-testow",
      headers: { cookie: adminCookie },
    });
    expect(check.statusCode).toBe(404);
  });
});
