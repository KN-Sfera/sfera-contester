import { defineConfig } from "drizzle-kit";

// Używane tylko przez `npm run db:generate` (generowanie SQL ze schematu).
// Runtime migruje przez runMigrations() z src/migrate.ts.
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://sfera:sfera@127.0.0.1:5433/sfera",
  },
  strict: true,
  verbose: true,
});
