import { runMigrations } from "@sfera/db";
import { buildApp } from "./app.js";
import { config } from "./config.js";

async function main(): Promise<void> {
  // Migrations before listening — we do not want traffic on an unready schema.
  await runMigrations(config.DATABASE_URL);

  const app = await buildApp();

  await app.listen({ port: config.PORT, host: config.HOST });

  app.judge0
    .waitUntilReady()
    .then(() => app.log.info("Judge0 is ready"))
    .catch((error) => {
      app.log.warn(
        { err: error },
        "Judge0 not ready yet — /api/run may fail until Judge0 boots",
      );
    });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
