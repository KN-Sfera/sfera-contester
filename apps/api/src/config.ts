import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  JUDGE0_URL: z.string().url().default("http://127.0.0.1:2358"),
  // Bez wartości domyślnej celowo — cichy fallback na złą bazę jest gorszy
  // niż odmowa startu.
  DATABASE_URL: z.string().min(1),
  /** Kolejka oceniania. Osobny Redis od tego, którego używa wewnętrznie Judge0. */
  REDIS_URL: z.string().min(1),
  // Opcjonalny — repozytorium zadań ma własną listę kandydatów na katalog.
  PROBLEMS_DIR: z.string().optional(),

  /** Podpisuje ciasteczka sesji. Zmiana wylogowuje wszystkich. */
  JWT_SECRET: z.string().min(32, "JWT_SECRET musi mieć co najmniej 32 znaki"),
  /** Ile dni żyje sesja. */
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(90).default(7),
  /**
   * `open` — każdy może założyć konto.
   * `invite` — tylko admin zakłada konta (tryb na konkurs).
   * `closed` — rejestracja wyłączona całkowicie.
   */
  REGISTRATION_MODE: z.enum(["open", "invite", "closed"]).default("open"),
  /** Wyłączane tylko na dev po HTTP. Na produkcji zawsze true. */
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
    throw new Error(`Niepoprawna konfiguracja środowiska:\n${details}`);
  }
  return parsed.data;
}

export const config = load();
