import type { Database, UserRow } from "@sfera/db";
import { config } from "../../config.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  bumpTokenVersion,
  createUser,
  findUserByEmail,
  findUserById,
} from "./repository.js";

export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists");
    this.name = "EmailTakenError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Incorrect email or password");
    this.name = "InvalidCredentialsError";
  }
}

export class RegistrationClosedError extends Error {
  constructor() {
    super("Registration is closed");
    this.name = "RegistrationClosedError";
  }
}

/** What goes into the token. No email — there is no reason to carry it there. */
export interface SessionClaims {
  sub: string;
  role: "USER" | "ADMIN";
  tv: number;
}

/** The public profile — it never carries the hash. */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: "USER" | "ADMIN";
}

export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export function toSessionClaims(user: UserRow): SessionClaims {
  return { sub: user.id, role: user.role, tv: user.tokenVersion };
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export async function register(
  db: Database,
  input: RegisterInput,
): Promise<UserRow> {
  if (config.REGISTRATION_MODE !== "open") {
    throw new RegistrationClosedError();
  }

  const existing = await findUserByEmail(db, input.email);
  if (existing) {
    throw new EmailTakenError();
  }

  return createUser(db, {
    email: input.email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
  });
}

export async function login(
  db: Database,
  input: { email: string; password: string },
): Promise<UserRow> {
  const user = await findUserByEmail(db, input.email);

  if (!user) {
    // We hash even with no account, so that response time does not reveal
    // which addresses are registered.
    await hashPassword(input.password);
    throw new InvalidCredentialsError();
  }

  const matches = await verifyPassword(user.passwordHash, input.password);
  if (!matches) {
    throw new InvalidCredentialsError();
  }

  return user;
}

/**
 * Checks whether a token is still valid. A correct signature is not enough —
 * the version inside the token has to match the user's current version.
 */
export async function resolveSession(
  db: Database,
  claims: SessionClaims,
): Promise<UserRow | null> {
  const user = await findUserById(db, claims.sub);
  if (!user) return null;
  if (user.tokenVersion !== claims.tv) return null;
  return user;
}

export function logoutEverywhere(db: Database, userId: string): Promise<void> {
  return bumpTokenVersion(db, userId);
}
