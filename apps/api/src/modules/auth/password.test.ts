import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("hashPassword", () => {
  it("nie zwraca hasła w postaci jawnej", async () => {
    const hash = await hashPassword("tajne-haslo-123");

    expect(hash).not.toContain("tajne-haslo-123");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("dwa hashe tego samego hasła różnią się solą", async () => {
    const first = await hashPassword("tajne-haslo-123");
    const second = await hashPassword("tajne-haslo-123");

    expect(first).not.toBe(second);
  });
});

describe("verifyPassword", () => {
  it("akceptuje poprawne hasło", async () => {
    const hash = await hashPassword("tajne-haslo-123");

    await expect(verifyPassword(hash, "tajne-haslo-123")).resolves.toBe(true);
  });

  it("odrzuca błędne hasło", async () => {
    const hash = await hashPassword("tajne-haslo-123");

    await expect(verifyPassword(hash, "tajne-haslo-124")).resolves.toBe(false);
  });

  it("rozróżnia wielkość liter", async () => {
    const hash = await hashPassword("tajne-haslo-123");

    await expect(verifyPassword(hash, "Tajne-Haslo-123")).resolves.toBe(false);
  });

  it("na uszkodzonym hashu zwraca false zamiast rzucać", async () => {
    await expect(verifyPassword("to-nie-jest-hash", "cokolwiek")).resolves.toBe(
      false,
    );
  });
});
