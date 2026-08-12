import { eq } from "drizzle-orm";
import { contests, problems, submissions } from "@sfera/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { hashPassword } from "../auth/password.js";
import { createUser } from "../auth/repository.js";
import type { ProblemFile } from "../../seed/problem-files.js";
import { seedProblems } from "../../seed/problems.js";
import { createFakeJudge0 } from "../../../test/fake-judge0.js";
import { createFakeProgressBus } from "../../../test/fake-progress.js";
import {
  createFakeJudgeQueue,
  type FakeJudgeQueue,
} from "../../../test/fake-queue.js";
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
let queue: FakeJudgeQueue;
let app: FastifyInstance;
let adminCookie: string;
let alaCookie: string;
let bobCookie: string;
let alaId: string;
let bobId: string;

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

/** Przesuwa okno konkursu tak, żeby „teraz" wypadło w zadanej minucie. */
async function setContestClock(minuteNow: number, durationMinutes = 300) {
  const startsAt = new Date(Date.now() - minuteNow * 60_000);
  await postgres.handle.db
    .update(contests)
    .set({ startsAt, durationMinutes })
    .where(eq(contests.slug, "icpc-2026"));
  return startsAt;
}

beforeAll(async () => {
  postgres = await startTestPostgres();
  queue = createFakeJudgeQueue();
  app = await buildApp({
    logger: false,
    database: postgres.handle,
    queue,
    progressBus: createFakeProgressBus(),
    judge0: createFakeJudge0(),
  });

  await seedProblems(postgres.handle.db, [
    problemFile("zad-a"),
    problemFile("zad-b"),
  ]);

  const passwordHash = await hashPassword("bardzo-tajne-haslo");
  await createUser(postgres.handle.db, {
    email: "admin@example.com",
    passwordHash,
    displayName: "Admin",
    role: "ADMIN",
  });
  const ala = await createUser(postgres.handle.db, {
    email: "ala@example.com",
    passwordHash,
    displayName: "Ala",
  });
  const bob = await createUser(postgres.handle.db, {
    email: "bob@example.com",
    passwordHash,
    displayName: "Bob",
  });
  alaId = ala.id;
  bobId = bob.id;

  adminCookie = await loginAs("admin@example.com");
  alaCookie = await loginAs("ala@example.com");
  bobCookie = await loginAs("bob@example.com");
});

afterAll(async () => {
  await app?.close();
  await postgres?.stop();
});

describe("tworzenie konkursu", () => {
  it("wymaga admina", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/contests",
      headers: { cookie: alaCookie },
      payload: {
        slug: "hack",
        title: "X",
        startsAt: new Date().toISOString(),
        durationMinutes: 60,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("zakłada konkurs z domyślnymi regułami ICPC", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/contests",
      headers: { cookie: adminCookie },
      payload: {
        slug: "icpc-2026",
        title: "Mistrzostwa 2026",
        startsAt: new Date(Date.now() + 3_600_000).toISOString(),
        durationMinutes: 300,
        visibility: "PUBLIC",
        registrationOpen: true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      penaltyMinutes: 20,
      freezeMinutes: 60,
      compileErrorCountsAsAttempt: false,
      unfrozen: false,
    });
  });

  it("przydziela zadaniom litery A, B, ...", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/admin/contests/icpc-2026/problems",
      headers: { cookie: adminCookie },
      payload: { problemSlugs: ["zad-b", "zad-a"] },
    });

    expect(response.json().map((p: { letter: string }) => p.letter)).toEqual([
      "A",
      "B",
    ]);
    // Litera idzie z kolejności na liście, nie z nazwy zadania.
    expect(response.json()[0].slug).toBe("zad-b");
  });

  it("odrzuca nieistniejące zadanie", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/admin/contests/icpc-2026/problems",
      headers: { cookie: adminCookie },
      payload: { problemSlugs: ["zad-a", "nie-ma"] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().slugs).toEqual(["nie-ma"]);
  });
});

describe("widoczność zadań przed startem", () => {
  it("zawodnik nie widzi listy zadań przed startem", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026",
      headers: { cookie: alaCookie },
    });

    expect(response.json().phase).toBe("UPCOMING");
    // Gdyby lista wyciekała, można by się przygotować przed sygnałem.
    expect(response.json().problems).toEqual([]);
  });

  it("admin widzi zadania zawsze", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026",
      headers: { cookie: adminCookie },
    });

    expect(response.json().problems).toHaveLength(2);
  });

  it("po starcie zadania są widoczne dla wszystkich", async () => {
    await setContestClock(10);

    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026",
      headers: { cookie: alaCookie },
    });

    expect(response.json().phase).toBe("RUNNING");
    expect(response.json().problems).toHaveLength(2);
  });
});

describe("rejestracja", () => {
  it("zapisuje zawodnika", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/register",
      headers: { cookie: alaCookie },
    });

    expect(response.statusCode).toBe(200);
  });

  it("powtórna rejestracja nie jest błędem", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/register",
      headers: { cookie: alaCookie },
    });

    expect(response.statusCode).toBe(200);
  });

  it("admin może dopisać zawodnika po adresie email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/contests/icpc-2026/participants",
      headers: { cookie: adminCookie },
      payload: { email: "bob@example.com" },
    });

    expect(response.statusCode).toBe(201);
  });

  it("zamknięta rejestracja blokuje zapisy", async () => {
    await app.inject({
      method: "PATCH",
      url: "/api/admin/contests/icpc-2026",
      headers: { cookie: adminCookie },
      payload: { registrationOpen: false },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/register",
      headers: { cookie: bobCookie },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("submity konkursowe", () => {
  it("niezapisany dostaje 403", async () => {
    await createUser(postgres.handle.db, {
      email: "obcy@example.com",
      passwordHash: await hashPassword("bardzo-tajne-haslo"),
      displayName: "Obcy",
    });
    const obcyCookie = await loginAs("obcy@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/submissions",
      headers: { cookie: obcyCookie },
      payload: { letter: "A", language: "python", source: "print(1)" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("przyjmuje submit i kolejkuje go z priorytetem konkursowym", async () => {
    queue.jobs.length = 0;

    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/submissions",
      headers: { cookie: alaCookie },
      payload: { letter: "A", language: "python", source: "print(1)" },
    });

    expect(response.statusCode).toBe(202);
    // W końcówce konkursu zawodnik nie może czekać za kolejką treningową.
    expect(queue.jobs[0]!.priority).toBe("contest");
  });

  it("wiąże submit z konkursem", async () => {
    const [contest] = await postgres.handle.db
      .select()
      .from(contests)
      .where(eq(contests.slug, "icpc-2026"));
    const rows = await postgres.handle.db
      .select()
      .from(submissions)
      .where(eq(submissions.contestId, contest!.id));

    expect(rows.length).toBeGreaterThan(0);
  });

  it("odrzuca literę spoza konkursu", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/submissions",
      headers: { cookie: alaCookie },
      payload: { letter: "Z", language: "python", source: "print(1)" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("przed startem nie da się submitować", async () => {
    await setContestClock(-10);

    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/submissions",
      headers: { cookie: alaCookie },
      payload: { letter: "A", language: "python", source: "print(1)" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().phase).toBe("UPCOMING");
  });

  it("po zakończeniu nie da się submitować", async () => {
    await setContestClock(400);

    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/submissions",
      headers: { cookie: alaCookie },
      payload: { letter: "A", language: "python", source: "print(1)" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().phase).toBe("FINISHED");
  });
});

describe("leaderboard", () => {
  /** Wstawia oceniony submit konkursowy w danej minucie zawodów. */
  async function scoredSubmission(
    userId: string,
    problemSlug: string,
    verdict: "AC" | "WA",
    minute: number,
    startsAt: Date,
  ) {
    const [contest] = await postgres.handle.db
      .select()
      .from(contests)
      .where(eq(contests.slug, "icpc-2026"));
    const [problem] = await postgres.handle.db
      .select()
      .from(problems)
      .where(eq(problems.slug, problemSlug));

    await postgres.handle.db.insert(submissions).values({
      userId,
      problemId: problem!.id,
      contestId: contest!.id,
      language: "python",
      source: "print(1)",
      status: "DONE",
      verdict,
      createdAt: new Date(startsAt.getTime() + minute * 60_000),
    });
  }

  it("liczy karę zgodnie z regułami ICPC", async () => {
    // Czyścimy submity z poprzednich testów, żeby ranking był przewidywalny.
    await postgres.handle.db.delete(submissions);
    const startsAt = await setContestClock(200);

    await scoredSubmission(alaId, "zad-b", "WA", 5, startsAt);
    await scoredSubmission(alaId, "zad-b", "AC", 30, startsAt);
    await scoredSubmission(bobId, "zad-b", "AC", 45, startsAt);

    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/leaderboard",
    });

    const rows = response.json().rows;
    // ala: 30 + 20 = 50, bob: 45 → bob wyżej
    expect(rows.map((row: { displayName: string }) => row.displayName)).toEqual([
      "Bob",
      "Ala",
    ]);
    expect(rows[0].totalPenalty).toBe(45);
    expect(rows[1].totalPenalty).toBe(50);
  });

  it("zamraża tablicę w ostatniej godzinie", async () => {
    const startsAt = await setContestClock(250);
    // Freeze zaczyna się w 240 minucie (300 - 60).
    await scoredSubmission(alaId, "zad-a", "AC", 245, startsAt);

    const player = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/leaderboard",
      headers: { cookie: alaCookie },
    });

    expect(player.json().frozen).toBe(true);
    const ala = player
      .json()
      .rows.find((row: { displayName: string }) => row.displayName === "Ala");
    expect(ala.solvedCount).toBe(1);
  });

  it("admin widzi prawdziwy stan mimo zamrożenia", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/leaderboard",
      headers: { cookie: adminCookie },
    });

    expect(response.json().frozen).toBe(false);
    const ala = response
      .json()
      .rows.find((row: { displayName: string }) => row.displayName === "Ala");
    expect(ala.solvedCount).toBe(2);
  });

  it("po rozmrożeniu wszyscy widzą komplet", async () => {
    await app.inject({
      method: "PATCH",
      url: "/api/admin/contests/icpc-2026",
      headers: { cookie: adminCookie },
      payload: { unfrozen: true },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/leaderboard",
      headers: { cookie: alaCookie },
    });

    expect(response.json().frozen).toBe(false);
    const ala = response
      .json()
      .rows.find((row: { displayName: string }) => row.displayName === "Ala");
    expect(ala.solvedCount).toBe(2);
  });

  it("eksport CSV zawiera nagłówek z literami zadań", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/contests/icpc-2026/leaderboard.csv",
      headers: { cookie: adminCookie },
    });

    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.payload.split("\n")[0]).toBe(
      "rank,participant,solved,penalty,A,B",
    );
  });

  it("wykreślony zawodnik znika z rankingu", async () => {
    await app.inject({
      method: "DELETE",
      url: `/api/admin/contests/icpc-2026/participants/${bobId}`,
      headers: { cookie: adminCookie },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/leaderboard",
    });

    expect(
      response.json().rows.map((row: { displayName: string }) => row.displayName),
    ).not.toContain("Bob");
  });
});

describe("clarifications", () => {
  it("zawodnik zadaje pytanie", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/clarifications",
      headers: { cookie: alaCookie },
      payload: { question: "Czy A może być ujemne?", problemLetter: "A" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().answer).toBeNull();
  });

  it("cudze pytanie bez odpowiedzi publicznej jest niewidoczne", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/clarifications",
      headers: { cookie: bobCookie },
    });

    expect(response.json()).toEqual([]);
  });

  it("pytający widzi swoje pytanie", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/clarifications",
      headers: { cookie: alaCookie },
    });

    expect(response.json()).toHaveLength(1);
  });

  it("odpowiedź publiczna trafia do wszystkich", async () => {
    const all = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/clarifications",
      headers: { cookie: adminCookie },
    });
    const id = all.json()[0].id;

    await app.inject({
      method: "POST",
      url: `/api/admin/contests/icpc-2026/clarifications/${id}/answer`,
      headers: { cookie: adminCookie },
      payload: { answer: "Nie, A jest dodatnie.", isPublic: true },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/clarifications",
      headers: { cookie: bobCookie },
    });

    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].answer).toBe("Nie, A jest dodatnie.");
  });

  it("ogłoszenie admina widzą wszyscy od razu", async () => {
    await app.inject({
      method: "POST",
      url: "/api/admin/contests/icpc-2026/announcements",
      headers: { cookie: adminCookie },
      payload: { message: "Zostało 30 minut." },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/clarifications",
      headers: { cookie: bobCookie },
    });

    const announcement = response
      .json()
      .find((item: { askedBy: string | null }) => item.askedBy === null);
    expect(announcement.question).toBe("Zostało 30 minut.");
  });
});

describe("konkursy prywatne", () => {
  it("nie są widoczne dla zawodników", async () => {
    await app.inject({
      method: "POST",
      url: "/api/admin/contests",
      headers: { cookie: adminCookie },
      payload: {
        slug: "tajny",
        title: "Tajny",
        startsAt: new Date().toISOString(),
        durationMinutes: 60,
        visibility: "PRIVATE",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/contests/tajny",
      headers: { cookie: alaCookie },
    });

    expect(response.statusCode).toBe(404);
  });

  it("nie pojawiają się na liście publicznej", async () => {
    const response = await app.inject({ method: "GET", url: "/api/contests" });

    expect(
      response.json().map((contest: { slug: string }) => contest.slug),
    ).toEqual(["icpc-2026"]);
  });
});
