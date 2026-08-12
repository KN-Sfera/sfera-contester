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
    passwordHash: await hashPassword("bardzo-tajne-haslo"),
    displayName: "Admin",
    role: "ADMIN",
  });
  await createUser(postgres.handle.db, {
    email: "zwykly@example.com",
    passwordHash: await hashPassword("bardzo-tajne-haslo"),
    displayName: "Zwykły",
  });

  adminCookie = await loginAs("admin@example.com", "bardzo-tajne-haslo");
  userCookie = await loginAs("zwykly@example.com", "bardzo-tajne-haslo");
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
      statement: "Wypisz sumę.",
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

describe("kontrola dostępu", () => {
  it("bez zalogowania zwraca 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/problems",
    });

    expect(response.statusCode).toBe(401);
  });

  it("zwykły użytkownik dostaje 403", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/problems",
      headers: { cookie: userCookie },
    });

    expect(response.statusCode).toBe(403);
  });

  it("zwykły użytkownik nie może tworzyć zadań", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problems",
      headers: { cookie: userCookie },
      payload: { slug: "hack", title: "X", statement: "Y" },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("tworzenie zadania", () => {
  it("nowe zadanie jest szkicem, nie publikuje się samo", async () => {
    const response = await createProblem("nowe-zadanie");

    expect(response.statusCode).toBe(201);
    expect(response.json().isPublic).toBe(false);
  });

  it("szkic nie jest widoczny na publicznej liście", async () => {
    const response = await app.inject({ method: "GET", url: "/api/problems" });

    expect(response.json()).toEqual([]);
  });

  it("odrzuca zajęty slug", async () => {
    const response = await createProblem("nowe-zadanie");

    expect(response.statusCode).toBe(409);
  });

  it("odrzuca slug z wielkimi literami i spacjami", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problems",
      headers: { cookie: adminCookie },
      payload: { slug: "Złe Slug", title: "X", statement: "Y" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("testy zadania", () => {
  it("numeruje testy od 1 w kolejności podania", async () => {
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

  it("admin widzi pełną treść testów, także ukrytych", async () => {
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

  it("zachowuje id testów przy powtórnym zapisie", async () => {
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

    // Inaczej historia submitów traciłaby powiązanie z testami przy każdej edycji.
    expect(after.json().testCases.map((tc: { id: string }) => tc.id)).toEqual(
      before.json().testCases.map((tc: { id: string }) => tc.id),
    );
  });

  it("usuwa testy, których zabrakło w nowym komplecie", async () => {
    await setTestCases("nowe-zadanie", 2);

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/problems/nowe-zadanie",
      headers: { cookie: adminCookie },
    });

    expect(response.json().testCases).toHaveLength(2);
  });
});

describe("publikacja z walidacją wzorcówki", () => {
  it("przepuszcza wzorcówkę przez wszystkie testy i publikuje", async () => {
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

  it("po publikacji zadanie jest widoczne publicznie", async () => {
    const response = await app.inject({ method: "GET", url: "/api/problems" });

    expect(response.json()).toEqual([
      expect.objectContaining({ slug: "nowe-zadanie" }),
    ]);
  });

  it("nie publikuje, gdy wzorcówka nie przechodzi", async () => {
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

  it("nie przerywa na pierwszym błędzie — admin widzi komplet problemów", async () => {
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

  it("pokazuje oczekiwane i faktyczne wyjście tylko dla testów, które padły", async () => {
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

  it("zadanie bez testów nie da się opublikować", async () => {
    await createProblem("bez-testow");

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problems/bez-testow/publish",
      headers: { cookie: adminCookie },
      payload: SOLUTION,
    });

    expect(response.statusCode).toBe(400);
  });

  it("nieistniejące zadanie zwraca 404", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problems/nie-ma/publish",
      headers: { cookie: adminCookie },
      payload: SOLUTION,
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("usuwanie", () => {
  it("usuwa zadanie razem z testami", async () => {
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
