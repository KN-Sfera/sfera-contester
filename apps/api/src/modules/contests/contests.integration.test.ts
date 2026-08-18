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
    statement: "Statement.",
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
    payload: { email, password: "integration-test-password" },
  });
  const session = response.cookies.find(
    (item) => item.name === "sfera_session",
  ) as { value: string };
  return `sfera_session=${session.value}`;
}

/** Shifts the contest window so that "now" falls on a given minute. */
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

  const passwordHash = await hashPassword("integration-test-password");
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

describe("creating a contest", () => {
  it("requires an admin", async () => {
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

  it("creates a contest with the default ICPC rules", async () => {
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

  it("assigns the problems letters A, B, ...", async () => {
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
    // The letter comes from the position in the list, not from the problem name.
    expect(response.json()[0].slug).toBe("zad-b");
  });

  it("rejects a problem that does not exist", async () => {
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

describe("problem visibility before the start", () => {
  it("hides the problem list from contestants before the start", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026",
      headers: { cookie: alaCookie },
    });

    expect(response.json().phase).toBe("UPCOMING");
    // If the list leaked, one could prepare before the signal.
    expect(response.json().problems).toEqual([]);
  });

  it("always shows the problems to an admin", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026",
      headers: { cookie: adminCookie },
    });

    expect(response.json().problems).toHaveLength(2);
  });

  it("shows the problems to everyone once the contest starts", async () => {
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

describe("registration", () => {
  it("registers a contestant", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/register",
      headers: { cookie: alaCookie },
    });

    expect(response.statusCode).toBe(200);
  });

  it("treats a repeated registration as a no-op", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/register",
      headers: { cookie: alaCookie },
    });

    expect(response.statusCode).toBe(200);
  });

  it("lets an admin add a contestant by email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/contests/icpc-2026/participants",
      headers: { cookie: adminCookie },
      payload: { email: "bob@example.com" },
    });

    expect(response.statusCode).toBe(201);
  });

  it("blocks sign-ups when registration is closed", async () => {
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

describe("contest submissions", () => {
  it("returns 403 to an unregistered contestant", async () => {
    await createUser(postgres.handle.db, {
      email: "stranger@example.com",
      passwordHash: await hashPassword("integration-test-password"),
      displayName: "Obcy",
    });
    const obcyCookie = await loginAs("stranger@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/submissions",
      headers: { cookie: obcyCookie },
      payload: { letter: "A", language: "python", source: "print(1)" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("accepts a submission and enqueues it at contest priority", async () => {
    queue.jobs.length = 0;

    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/submissions",
      headers: { cookie: alaCookie },
      payload: { letter: "A", language: "python", source: "print(1)" },
    });

    expect(response.statusCode).toBe(202);
    // Towards the end of a contest nobody can wait behind the practice queue.
    expect(queue.jobs[0]!.priority).toBe("contest");
  });

  it("ties the submission to the contest", async () => {
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

  it("rejects a letter that is not in the contest", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/submissions",
      headers: { cookie: alaCookie },
      payload: { letter: "Z", language: "python", source: "print(1)" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("refuses submissions before the start", async () => {
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

  it("refuses submissions after the end", async () => {
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
  /** Inserts a judged contest submission at a given contest minute. */
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

  it("computes the penalty by the ICPC rules", async () => {
    // Clear submissions from earlier tests so the ranking is predictable.
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
    // ala: 30 + 20 = 50, bob: 45 → bob ranks higher
    expect(rows.map((row: { displayName: string }) => row.displayName)).toEqual([
      "Bob",
      "Ala",
    ]);
    expect(rows[0].totalPenalty).toBe(45);
    expect(rows[1].totalPenalty).toBe(50);
  });

  it("freezes the scoreboard for the final hour", async () => {
    const startsAt = await setContestClock(250);
    // The freeze begins at minute 240 (300 - 60).
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

  it("shows an admin the true state despite the freeze", async () => {
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

  it("shows everyone the full board once unfrozen", async () => {
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

  it("puts the problem letters in the CSV header", async () => {
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

  it("removes a struck-off contestant from the ranking", async () => {
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
  it("a contestant asks a question", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/contests/icpc-2026/clarifications",
      headers: { cookie: alaCookie },
      payload: { question: "Can A be negative?", problemLetter: "A" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().answer).toBeNull();
  });

  it("hides someone else's question until it is answered publicly", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/clarifications",
      headers: { cookie: bobCookie },
    });

    expect(response.json()).toEqual([]);
  });

  it("shows a question to whoever asked it", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/clarifications",
      headers: { cookie: alaCookie },
    });

    expect(response.json()).toHaveLength(1);
  });

  it("delivers a public answer to everyone", async () => {
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
      payload: { answer: "No, A is positive.", isPublic: true },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/clarifications",
      headers: { cookie: bobCookie },
    });

    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].answer).toBe("No, A is positive.");
  });

  it("shows an admin announcement to everyone at once", async () => {
    await app.inject({
      method: "POST",
      url: "/api/admin/contests/icpc-2026/announcements",
      headers: { cookie: adminCookie },
      payload: { message: "30 minutes left." },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/contests/icpc-2026/clarifications",
      headers: { cookie: bobCookie },
    });

    const announcement = response
      .json()
      .find((item: { askedBy: string | null }) => item.askedBy === null);
    expect(announcement.question).toBe("30 minutes left.");
  });
});

describe("private contests", () => {
  it("keeps them hidden from contestants", async () => {
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

  it("keeps them off the public list", async () => {
    const response = await app.inject({ method: "GET", url: "/api/contests" });

    expect(
      response.json().map((contest: { slug: string }) => contest.slug),
    ).toEqual(["icpc-2026"]);
  });
});
