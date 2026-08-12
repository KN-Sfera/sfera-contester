import { z } from "zod";

/**
 * Konfiguracja dla skryptów operacyjnych (seed).
 *
 * Świadomie osobna od `config.ts` serwera: seed nie wystawia HTTP, nie wydaje
 * sesji i nie kolejkuje niczego, więc nie ma powodu, żeby wymagał `JWT_SECRET`
 * ani `REDIS_URL`. Wspólna konfiguracja blokowała pierwszy seed na świeżym
 * wdrożeniu, zanim jeszcze było co zabezpieczać.
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
    console.error(`Niepoprawna konfiguracja środowiska:\n${details}`);
    process.exit(1);
  }
  return parsed.data;
}
