import { hash, verify } from "@node-rs/argon2";

/**
 * argon2id parameters per the OWASP recommendation (19 MiB, 2 iterations,
 * 1 thread). We deliberately do not lower them — signing in is rare, and this
 * is the only barrier between a database leak and the contestants' passwords.
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
    // A corrupted hash in the database is no reason to fail sign-in with a 500.
    return false;
  }
}
