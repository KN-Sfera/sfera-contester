import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { createDatabase, runMigrations, type DatabaseHandle } from "@sfera/db";

export interface TestPostgres {
  handle: DatabaseHandle;
  stop: () => Promise<void>;
}

export async function startTestPostgres(): Promise<TestPostgres> {
  const container: StartedPostgreSqlContainer =
    await new PostgreSqlContainer("postgres:16.2").start();
  const connectionString = container.getConnectionUri();

  await runMigrations(connectionString);
  const handle = createDatabase({ connectionString });

  return {
    handle,
    stop: async () => {
      await handle.close();
      await container.stop();
    },
  };
}
