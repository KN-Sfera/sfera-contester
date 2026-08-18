import { createDatabase, runMigrations } from "@sfera/db";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../modules/auth/password.js";
import { createUser, findUserByEmail } from "../modules/auth/repository.js";
import { loadOpsEnv } from "./ops-env.js";

/**
 * Creates the first administrator account. With REGISTRATION_MODE=invite this
 * is the only way into the system.
 *
 * ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... npm run seed:admin
 */
async function main(): Promise<void> {
  const env = loadOpsEnv();

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    console.error("Ustaw ADMIN_EMAIL i ADMIN_PASSWORD");
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
    process.exit(1);
  }

  await runMigrations(env.DATABASE_URL);

  const handle = createDatabase({ connectionString: env.DATABASE_URL });
  try {
    const existing = await findUserByEmail(handle.db, email);
    if (existing) {
      console.log(`Account ${email} already exists — nothing to do`);
      return;
    }

    const user = await createUser(handle.db, {
      email,
      passwordHash: await hashPassword(password),
      displayName,
      role: "ADMIN",
    });
    console.log(`Admin ${user.email} utworzony`);
  } finally {
    await handle.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
