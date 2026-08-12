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
    super("Konto z tym adresem już istnieje");
    this.name = "EmailTakenError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Niepoprawny email lub hasło");
    this.name = "InvalidCredentialsError";
  }
}

export class RegistrationClosedError extends Error {
  constructor() {
    super("Rejestracja jest wyłączona");
    this.name = "RegistrationClosedError";
  }
}

/** To, co ląduje w tokenie. Bez emaila — nie ma powodu go tam nosić. */
export interface SessionClaims {
  sub: string;
  role: "USER" | "ADMIN";
  tv: number;
}

/** Publiczny profil — nigdy nie zawiera hasha. */
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
    // Hashujemy mimo braku konta, żeby czas odpowiedzi nie zdradzał, które
    // adresy są zarejestrowane.
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
 * Sprawdza, czy token wciąż jest ważny. Sama poprawność podpisu nie wystarczy —
 * wersja w tokenie musi zgadzać się z aktualną wersją użytkownika.
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
