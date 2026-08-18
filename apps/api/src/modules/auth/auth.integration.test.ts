import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { createFakeProgressBus } from "../../../test/fake-progress.js";
import { createFakeJudgeQueue } from "../../../test/fake-queue.js";
import { startTestPostgres, type TestPostgres } from "../../../test/postgres.js";
import { hashPassword } from "./password.js";
import { createUser } from "./repository.js";

const CREDENTIALS = {
  email: "contestant@example.com",
  password: "integration-test-password",
  displayName: "Contestant",
};

let postgres: TestPostgres;
let app: FastifyInstance;

beforeAll(async () => {
  postgres = await startTestPostgres();
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

function sessionCookie(response: { cookies: unknown[] }): string {
  const cookies = response.cookies as { name: string; value: string }[];
  const session = cookies.find((cookie) => cookie.name === "sfera_session");
  return `sfera_session=${session?.value ?? ""}`;
}

describe("POST /api/auth/register", () => {
  it("creates an account, sets a session and never returns the hash", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: CREDENTIALS,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: expect.any(String),
      email: "contestant@example.com",
      displayName: "Contestant",
      role: "USER",
    });
    expect(response.payload).not.toContain("passwordHash");
    expect(response.payload).not.toContain(CREDENTIALS.password);

    const cookie = response.cookies.find(
      (item) => item.name === "sfera_session",
    ) as { httpOnly?: boolean; sameSite?: string } | undefined;
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite?.toLowerCase()).toBe("lax");
  });

  it("rejects a second registration for the same email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { ...CREDENTIALS, displayName: "Somebody else" },
    });

    expect(response.statusCode).toBe(409);
  });

  it("treats the email address case-insensitively", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { ...CREDENTIALS, email: "CONTESTANT@Example.COM" },
    });

    expect(response.statusCode).toBe(409);
  });

  it("rejects a password that is too short", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "short@example.com", password: "abc", displayName: "X" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("signs in with correct credentials", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: CREDENTIALS.email, password: CREDENTIALS.password },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().email).toBe(CREDENTIALS.email);
  });

  it("rejects a wrong password", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: CREDENTIALS.email, password: "wrong-password-123" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("does not reveal whether an account exists", async () => {
    const missingAccount = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@example.com", password: "wrong-password-123" },
    });
    const wrongPassword = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: CREDENTIALS.email, password: "wrong-password-123" },
    });

    expect(missingAccount.statusCode).toBe(wrongPassword.statusCode);
    expect(missingAccount.json()).toEqual(wrongPassword.json());
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 with no cookie", async () => {
    const response = await app.inject({ method: "GET", url: "/api/auth/me" });

    expect(response.statusCode).toBe(401);
  });

  it("returns 401 for a forged token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: "sfera_session=not.a.real.token" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns the profile for a valid session", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: CREDENTIALS.email, password: CREDENTIALS.password },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: sessionCookie(loginResponse) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().email).toBe(CREDENTIALS.email);
  });
});

describe("signing out", () => {
  it("clears the cookie on logout", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
    });

    const cookie = response.cookies.find(
      (item) => item.name === "sfera_session",
    ) as { value?: string } | undefined;
    expect(cookie?.value).toBe("");
  });

  it("voids previously issued tokens on logout-all", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: CREDENTIALS.email, password: CREDENTIALS.password },
    });
    const cookie = sessionCookie(loginResponse);

    // The token works before it is voided.
    const before = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    expect(before.statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: "/api/auth/logout-all",
      headers: { cookie },
    });

    // The same correctly signed token stops working once token_version is bumped.
    const after = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    expect(after.statusCode).toBe(401);
  });
});

describe("requireRole", () => {
  it("stops accepting the token of a deleted user", async () => {
    const password = await hashPassword("password-to-be-deleted");
    const user = await createUser(postgres.handle.db, {
      email: "vanishing@example.com",
      passwordHash: password,
      displayName: "Vanishing",
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "vanishing@example.com",
        password: "password-to-be-deleted",
      },
    });
    const cookie = sessionCookie(loginResponse);

    const { users } = await import("@sfera/db");
    const { eq } = await import("drizzle-orm");
    await postgres.handle.db.delete(users).where(eq(users.id, user.id));

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(401);
  });
});
