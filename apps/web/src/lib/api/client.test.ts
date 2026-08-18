import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./client";

function respond(status: number, body: unknown): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("sends the session cookie — without it every request is a 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/auth/me");

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
    });
  });

  it("does not attach a content-type to bodyless requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/problems");

    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers;
    expect(headers).not.toHaveProperty("content-type");
  });

  it("maps zod field errors onto form fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        respond(400, {
          error: {
            fieldErrors: { password: ["Password is too short"] },
            formErrors: [],
          },
        }),
      ),
    );

    const error = await apiFetch("/api/auth/register", {
      method: "POST",
      body: {},
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fieldError("password")).toBe("Password is too short");
    expect((error as ApiError).message).toBe("Password is too short");
  });

  it("passes the backend message through instead of a generic one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respond(401, { error: "Invalid credentials" })),
    );

    const error = (await apiFetch("/api/auth/login", {
      method: "POST",
      body: {},
    }).catch((caught: unknown) => caught)) as ApiError;

    expect(error.message).toBe("Invalid credentials");
    expect(error.isUnauthorized).toBe(true);
  });

  it("says this is a rate limit, not a bad password", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(429, undefined)));

    const error = (await apiFetch("/api/auth/login", {
      method: "POST",
      body: {},
    }).catch((caught: unknown) => caught)) as ApiError;

    expect(error.isRateLimited).toBe(true);
    expect(error.message).toMatch(/Too many attempts/);
  });

  it("tells a dead network apart from an API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed")));

    const error = (await apiFetch("/api/problems").catch(
      (caught: unknown) => caught,
    )) as ApiError;

    expect(error.status).toBe(0);
    expect(error.message).toMatch(/No connection/);
  });

  it("does not try to parse an empty 204 body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiFetch("/api/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});
