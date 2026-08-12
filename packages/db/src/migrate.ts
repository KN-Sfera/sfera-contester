import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client.js";

/** Katalog z wygenerowanym SQL-em. Działa tak samo ze źródeł i z dist/. */
export const migrationsFolder = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);

/**
 * Odpalane przy starcie API. Drizzle trzyma dziennik zastosowanych migracji
 * w tabeli `__drizzle_migrations`, więc wywołanie jest idempotentne.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const handle = createDatabase({ connectionString, maxConnections: 1 });
  try {
    await migrate(handle.db, { migrationsFolder });
  } finally {
    await handle.close();
  }
}
