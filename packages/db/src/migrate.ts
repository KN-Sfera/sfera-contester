import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client.js";

/** Directory holding the generated SQL. Works the same from source and from dist/. */
export const migrationsFolder = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);

/**
 * Odpalane przy starcie API. Drizzle trzyma dziennik zastosowanych migracji
 * in the `__drizzle_migrations` table, so calling this is idempotent.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const handle = createDatabase({ connectionString, maxConnections: 1 });
  try {
    await migrate(handle.db, { migrationsFolder });
  } finally {
    await handle.close();
  }
}
