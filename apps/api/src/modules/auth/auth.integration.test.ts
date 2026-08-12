import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { createFakeProgressBus } from "../../../test/fake-progress.js";
import { createFakeJudgeQueue } from "../../../test/fake-queue.js";
import { startTestPostgres, type TestPostgres } from "../../../test/postgres.js";
import { hashPassword } from "./password.js";
import { createUser } from "./repository.js";

const CREDENTIALS = {
  email: "zawodnik@example.com",
  password: "bardzo-tajne-haslo",
  displayName: "Zawodnik",
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
  it("zakłada konto, ustawia sesję i nie zwraca hasha", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: CREDENTIALS,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: expect.any(String),
      email: "zawodnik@example.com",
      displayName: "Zawodnik",
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

  it("odrzuca drugi rejestracja na ten sam adres", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { ...CREDENTIALS, displayName: "Ktoś inny" },
    });

    expect(response.statusCode).toBe(409);
  });

  it("traktuje adres bez względu na wielkość liter", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { ...CREDENTIALS, email: "ZAWODNIK@Example.COM" },
    });

    expect(response.statusCode).toBe(409);
  });

  it("odrzuca za krótkie hasło", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "krotkie@example.com", password: "abc", displayName: "X" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("loguje poprawnymi danymi", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: CREDENTIALS.email, password: CREDENTIALS.password },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().email).toBe(CREDENTIALS.email);
  });

  it("odrzuca złe hasło", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: CREDENTIALS.email, password: "zle-haslo-123" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("nie zdradza, czy konto istnieje", async () => {
    const nieistniejace = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nikt@example.com", password: "zle-haslo-123" },
    });
    const zleHaslo = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: CREDENTIALS.email, password: "zle-haslo-123" },
    });

    expect(nieistniejace.statusCode).toBe(zleHaslo.statusCode);
    expect(nieistniejace.json()).toEqual(zleHaslo.json());
  });
});

describe("GET /api/auth/me", () => {
  it("bez ciasteczka zwraca 401", async () => {
    const response = await app.inject({ method: "GET", url: "/api/auth/me" });

    expect(response.statusCode).toBe(401);
  });

  it("z podrobionym tokenem zwraca 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: "sfera_session=to.nie.jest.token" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("z ważną sesją zwraca profil", async () => {
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

describe("wylogowanie", () => {
  it("logout czyści ciasteczko", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
    });

    const cookie = response.cookies.find(
      (item) => item.name === "sfera_session",
    ) as { value?: string } | undefined;
    expect(cookie?.value).toBe("");
  });

  it("logout-all unieważnia tokeny wydane wcześniej", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: CREDENTIALS.email, password: CREDENTIALS.password },
    });
    const cookie = sessionCookie(loginResponse);

    // Token działa przed unieważnieniem.
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

    // Ten sam, poprawnie podpisany token po podbiciu token_version już nie działa.
    const after = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    expect(after.statusCode).toBe(401);
  });
});

describe("requireRole", () => {
  it("token usuniętego użytkownika przestaje działać", async () => {
    const password = await hashPassword("haslo-do-skasowania");
    const user = await createUser(postgres.handle.db, {
      email: "znikajacy@example.com",
      passwordHash: password,
      displayName: "Znikający",
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "znikajacy@example.com",
        password: "haslo-do-skasowania",
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
