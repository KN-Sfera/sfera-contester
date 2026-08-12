export { createDatabase, schema } from "./client.js";
export type {
  CreateDatabaseOptions,
  Database,
  DatabaseHandle,
} from "./client.js";
export { migrationsFolder, runMigrations } from "./migrate.js";
export * from "./schema/index.js";
