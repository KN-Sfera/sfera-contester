import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JUDGE0_URL: z.string().url().default("http://127.0.0.1:2358"),
  /**
   * Ile submitów worker ocenia równolegle. Sufit wyznacza liczba workerów
   * Judge0 — wyżej tylko zapycha sandbox i pogarsza czasy wszystkim.
   */
  JUDGE_CONCURRENCY: z.coerce.number().int().positive().max(32).default(2),
});

export type Config = z.infer<typeof envSchema>;

function load(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = JSON.stringify(parsed.error.flatten().fieldErrors, null, 2);
    throw new Error(`Niepoprawna konfiguracja środowiska:\n${details}`);
  }
  return parsed.data;
}

export const config = load();
