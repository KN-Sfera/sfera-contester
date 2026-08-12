import { runMigrations } from "../migrate.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL nie jest ustawione");
  process.exit(1);
}

runMigrations(connectionString)
  .then(() => {
    console.log("Migracje zastosowane");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
