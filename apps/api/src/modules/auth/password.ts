import { hash, verify } from "@node-rs/argon2";

/**
 * Parametry argon2id zgodne z zaleceniem OWASP (19 MiB, 2 iteracje, 1 wątek).
 * Świadomie nie ruszamy ich w dół — logowanie zdarza się rzadko, a to jedyna
 * bariera między wyciekiem bazy a hasłami zawodników.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plain, OPTIONS);
  } catch {
    // Uszkodzony hash w bazie to nie powód, żeby wywalić logowanie 500-tką.
    return false;
  }
}
