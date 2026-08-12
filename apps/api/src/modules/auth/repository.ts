import { eq, sql } from "drizzle-orm";
import { users, type Database, type UserRow } from "@sfera/db";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(
  db: Database,
  email: string,
): Promise<UserRow | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return user ?? null;
}

export async function findUserById(
  db: Database,
  id: string,
): Promise<UserRow | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  role?: "USER" | "ADMIN";
}

export async function createUser(
  db: Database,
  input: CreateUserInput,
): Promise<UserRow> {
  const [user] = await db
    .insert(users)
    .values({
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      role: input.role ?? "USER",
    })
    .returning();
  return user!;
}

/** Unieważnia wszystkie wydane tokeny użytkownika. */
export async function bumpTokenVersion(
  db: Database,
  userId: string,
): Promise<void> {
  await db
    .update(users)
    .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, userId));
}
