import { createDatabase, type Database, type DatabaseHandle } from "@sfera/db";
import { config } from "./config.js";

export type { Database, DatabaseHandle };

export function createAppDatabase(): DatabaseHandle {
  return createDatabase({ connectionString: config.DATABASE_URL });
}
