import { eq } from "drizzle-orm";
import { problems, submissions } from "@sfera/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { hashPassword } from "../auth/password.js";
import { createUser } from "../auth/repository.js";
import type { ProblemFile } from "../../seed/problem-files.js";
import { seedProblems } from "../../seed/problems.js";
import { createFakeJudge0 } from "../../../test/fake-judge0.js";
import { createFakeProgressBus } from "../../../test/fake-progress.js";
import { createFakeJudgeQueue } from "../../../test/fake-queue.js";
import { startTestPostgres, type TestPostgres } from "../../../test/postgres.js";

function problemFile(slug: string): ProblemFile {
  return {
    slug,
    title: `Zadanie ${slug}`,
    statement: "Treść.",
    timeLimit: 2,
    memoryLimit: 128000,
    testCases: [{ input: "1\n", expectedOutput: "1\n", isSample: true }],
  };
}

let postgres: TestPostgres;
let app: FastifyInstance;
let adminCookie: string;
let userCookie: string;
let userId: string;

async function loginAs(email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password: "bardzo-tajne-haslo" },
  });
  const session = response.cookies.find(
    (item) => item.name === "sfera_session",
  ) as { value: string };
  return `sfera_session=${session.value}`;
}

beforeAll(async () => {
  postgres = await startTestPostgres();
  app = await buildApp({
    logger: false,
    database: postgres.handle,
    queue: createFakeJudgeQueue(),
    progressBus: createFakeProgressBus(),
    judge0: createFakeJudge0(),
  });

  await seedProblems(postgres.handle.db, [
    problemFile("zad-a"),
    problemFile("zad-b"),
    problemFile("zad-c"),
  ]);
  // Trzecie zadanie zostaje szkicem — nie powinno liczyć się do postępu.
  await postgres.handle.db
    .update(problems)
    .set({ isPublic: false })
    .where(eq(problems.slug, "zad-c"));

  const passwordHash = await hashPassword("bardzo-tajne-haslo");
  await createUser(postgres.handle.db, {
    email: "admin@example.com",
    passwordHash,
    displayName: "Admin",
    role: "ADMIN",
  });
  const user = await createUser(postgres.handle.db, {
    email: "zawodnik@example.com",
    passwordHash,
    displayName: "Zawodnik",
  });
  userId = user.id;

  adminCookie = await loginAs("admin@example.com");
  userCookie = await loginAs("zawodnik@example.com");
});

afterAll(async () => {
  await app?.close();
  await postgres?.stop();
});

describe("tworzenie zestawu", () => {
  it("wymaga admina", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problem-sets",
      headers: { cookie: userCookie },
      payload: { slug: "hack", title: "X" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("nowy zestaw jest szkicem", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/problem-sets",
      headers: { cookie: adminCookie },
      payload: { slug: "dp-podstawy", title: "DP dla początkujących" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().isPublic).toBe(false);
  });

  it("szkicu nie widać publicznie", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/problem-sets",
    });

    expect(response.json()).toEqual([]);
  });
});

describe("zawartość zestawu", () => {
  it("ustawia zadania w podanej kolejności", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/admin/problem-sets/dp-podstawy/items",
      headers: { cookie: adminCookie },
      payload: { problemSlugs: ["zad-b", "zad-a", "zad-c"] },
    });

    expect(response.statusCode).toBe(200);
  });

  it("odrzuca nieistniejące zadanie i mówi które", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/admin/problem-sets/dp-podstawy/items",
      headers: { cookie: adminCookie },
      payload: { problemSlugs: ["zad-a", "nie-ma-takiego"] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().slugs).toEqual(["nie-ma-takiego"]);
  });

  it("odrzuca to samo zadanie dwa razy", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/admin/problem-sets/dp-podstawy/items",
      headers: { cookie: adminCookie },
      payload: { problemSlugs: ["zad-a", "zad-a"] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().slugs).toEqual(["zad-a"]);
  });

  it("nieudana zmiana nie psuje poprzedniej zawartości", async () => {
    await app.inject({
      method: "PATCH",
      url: "/api/admin/problem-sets/dp-podstawy",
      headers: { cookie: adminCookie },
      payload: { isPublic: true },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/problem-sets/dp-podstawy",
    });

    // Transakcja wycofała skasowanie pozycji — kolejność z pierwszego zapisu.
    expect(response.json().problems.map((p: { slug: string }) => p.slug)).toEqual([
      "zad-b",
      "zad-a",
    ]);
  });
});

describe("widok publiczny", () => {
  it("pomija zadania nieopublikowane", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/problem-sets/dp-podstawy",
    });

    const slugs = response.json().problems.map((p: { slug: string }) => p.slug);
    expect(slugs).not.toContain("zad-c");
    expect(slugs).toHaveLength(2);
  });

  it("dla niezalogowanego nie liczy postępu", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/problem-sets",
    });

    expect(response.json()).toEqual([
      expect.objectContaining({
        slug: "dp-podstawy",
        problemCount: 2,
        solvedCount: null,
      }),
    ]);
  });

  it("dla zalogowanego bez zaliczeń pokazuje zero", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/problem-sets",
      headers: { cookie: userCookie },
    });

    expect(response.json()[0]).toMatchObject({
      problemCount: 2,
      solvedCount: 0,
    });
  });

  it("liczy postęp po zaliczonym submicie", async () => {
    const [problem] = await postgres.handle.db
      .select()
      .from(problems)
      .where(eq(problems.slug, "zad-a"));
    await postgres.handle.db.insert(submissions).values({
      userId,
      problemId: problem!.id,
      language: "python",
      source: "print(1)",
      status: "DONE",
      verdict: "AC",
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/problem-sets",
      headers: { cookie: userCookie },
    });
    expect(list.json()[0]).toMatchObject({ problemCount: 2, solvedCount: 1 });

    const detail = await app.inject({
      method: "GET",
      url: "/api/problem-sets/dp-podstawy",
      headers: { cookie: userCookie },
    });
    const solved = detail
      .json()
      .problems.filter((p: { solved: boolean }) => p.solved);
    expect(solved.map((p: { slug: string }) => p.slug)).toEqual(["zad-a"]);
  });

  it("submit bez AC nie liczy się jako zaliczenie", async () => {
    const [problem] = await postgres.handle.db
      .select()
      .from(problems)
      .where(eq(problems.slug, "zad-b"));
    await postgres.handle.db.insert(submissions).values({
      userId,
      problemId: problem!.id,
      language: "python",
      source: "print(2)",
      status: "DONE",
      verdict: "WA",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/problem-sets",
      headers: { cookie: userCookie },
    });

    expect(response.json()[0].solvedCount).toBe(1);
  });

  it("postęp jednego użytkownika nie przecieka do drugiego", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/problem-sets",
      headers: { cookie: adminCookie },
    });

    expect(response.json()[0].solvedCount).toBe(0);
  });
});

describe("usuwanie zestawu", () => {
  it("nie kasuje zadań, tylko przypisania", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/admin/problem-sets/dp-podstawy",
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(204);

    const stillThere = await app.inject({
      method: "GET",
      url: "/api/problems/zad-a",
    });
    expect(stillThere.statusCode).toBe(200);
  });
});
