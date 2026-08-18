import { z } from "zod";

/**
 * Configuration for the operational scripts (seeding).
 *
 * Deliberately separate from the server's `config.ts`: seeding serves no HTTP, issues no
 * sessions and queues nothing, so there is no reason for it to require
 * `JWT_SECRET` or `REDIS_URL`. Sharing the API's configuration blocked the very
 * first seed on a fresh deployment, before there was anything to secure.
 */
const opsSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PROBLEMS_DIR: z.string().optional(),
});

export type OpsEnv = z.infer<typeof opsSchema>;

export function loadOpsEnv(): OpsEnv {
  const parsed = opsSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = JSON.stringify(parsed.error.flatten().fieldErrors, null, 2);
    console.error(`Invalid environment configuration:\n${details}`);
    process.exit(1);
  }
  return parsed.data;
}
