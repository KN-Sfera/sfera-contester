import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

export interface CreateDatabaseOptions {
  connectionString: string;
  /** Defaults to 10 — a sensible ceiling for one host and a few processes. */
  maxConnections?: number;
}

export interface DatabaseHandle {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

/**
 * Creates a connection pool and a Drizzle client. There is deliberately no
 * global singleton — every process (api, worker, tests) opens its own connection
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
