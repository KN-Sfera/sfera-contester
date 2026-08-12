import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

export interface CreateDatabaseOptions {
  connectionString: string;
  /** Domyślnie 10 — przy jednym hoście i kilku procesach to sensowny sufit. */
  maxConnections?: number;
}

export interface DatabaseHandle {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

/**
 * Tworzy pulę połączeń i klienta Drizzle. Świadomie nie ma tu globalnego
 * singletona — każdy proces (api, worker, testy) zakłada własne połączenie
 * i sam je zamyka.
 */
export function createDatabase(
  options: CreateDatabaseOptions,
): DatabaseHandle {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
  });

  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    close: () => pool.end(),
  };
}

export { schema };
