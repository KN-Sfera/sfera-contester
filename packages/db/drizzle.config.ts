import { defineConfig } from "drizzle-kit";

// Used only by `npm run db:generate` (generating SQL from the schema).
// At runtime, migrations go through runMigrations() from src/migrate.ts.
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
