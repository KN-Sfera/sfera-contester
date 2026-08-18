import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JUDGE0_URL: z.string().url().default("http://127.0.0.1:2358"),
  /**
   * How many submissions the worker judges in parallel. The ceiling is the
   * number of Judge0 workers — going higher only floods the sandbox and makes
   * times worse for everyone.
   */
  JUDGE_CONCURRENCY: z.coerce.number().int().positive().max(32).default(2),
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
