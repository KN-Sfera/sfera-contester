import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("hashPassword", () => {
  it("never returns the password in plain text", async () => {
    const hash = await hashPassword("test-password-123");

    expect(hash).not.toContain("test-password-123");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("salts two hashes of the same password differently", async () => {
    const first = await hashPassword("test-password-123");
    const second = await hashPassword("test-password-123");

    expect(first).not.toBe(second);
  });
});

describe("verifyPassword", () => {
  it("accepts the correct password", async () => {
    const hash = await hashPassword("test-password-123");

    await expect(verifyPassword(hash, "test-password-123")).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("test-password-123");

    await expect(verifyPassword(hash, "test-password-124")).resolves.toBe(false);
  });

  it("is case sensitive", async () => {
    const hash = await hashPassword("test-password-123");

    await expect(verifyPassword(hash, "Test-Password-123")).resolves.toBe(false);
  });

  it("returns false on a corrupted hash instead of throwing", async () => {
    await expect(verifyPassword("not-a-hash", "whatever")).resolves.toBe(
      false,
    );
  });
});
