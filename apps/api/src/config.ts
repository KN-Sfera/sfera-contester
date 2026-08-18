import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  JUDGE0_URL: z.string().url().default("http://127.0.0.1:2358"),
  // Deliberately without a default — silently falling back to the wrong
  // database is worse than refusing to start.
  DATABASE_URL: z.string().min(1),
  /** The judging queue. A separate Redis from the one Judge0 uses internally. */
  REDIS_URL: z.string().min(1),
  // Optional — the problem repository has its own list of candidate directories.
  PROBLEMS_DIR: z.string().optional(),

  /** Podpisuje ciasteczka sesji. Zmiana wylogowuje wszystkich. */
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  /** How many days a session lives. */
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(90).default(7),
  /**
   * `open` — anyone can create an account.
   * `invite` — only an admin creates accounts (contest mode).
   * `closed` — registration is disabled entirely.
   */
  REGISTRATION_MODE: z.enum(["open", "invite", "closed"]).default("open"),
  /** Disabled only for local HTTP development. Always true in production. */
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

export type Config = z.infer<typeof envSchema>;

function load(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = JSON.stringify(parsed.error.flatten().fieldErrors, null, 2);
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

export const config = load();
