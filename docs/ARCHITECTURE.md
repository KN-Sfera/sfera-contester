# Architecture — Sfera Sandbox MVP

## Przepływ

Dwie ścieżki wykonania kodu — świadomie różne.

**Submit (oceniany, asynchroniczny):**

```
Browser ──► Fastify API ──► PostgreSQL (submit QUEUED)
                │
                └──► Redis / BullMQ ──► worker ──► Judge0 CE (Isolate)
                                          │
                                          ├─► wyniki per test → PostgreSQL
                                          └─► postęp → Redis pub/sub → SSE → Browser
```

1. `POST /api/submissions` zapisuje submit i wrzuca id do kolejki, po czym **od razu**
   odpowiada `202` — request nie czeka na kompilację.
2. Worker (osobny proces) pobiera testy z bazy i przepuszcza je przez Judge0
   **przerywając na pierwszym niezaliczonym** (reguła ICPC).
3. Wyniki per test i werdykt lądują w bazie w jednej transakcji.

**Playground (`POST /api/run`, bez zapisu):** synchroniczny strzał do Judge0 z `wait=true`.
Inny przypadek użycia i wygodna ścieżka awaryjna, gdy kolejka nie działa.

Zadania i testy żyją w bazie; `data/problems/*.json` to tylko format seedowy —
`npm run seed:problems` wgrywa je idempotentnie.

Werdykty: `AC`, `WA`, `CE`, `RE`, `TLE`, `MLE`, `SE` (plus `OK` wyłącznie w playgroundzie,
gdzie nie ma z czym porównać wyjścia). Comparer trimuje końce linii.

## Dlaczego Judge0

Judge0 opakowuje Isolate (IOI) i dostarcza REST API z kompilatorami (gcc, g++, clang, python).
Nie budujemy własnego sandboxa w MVP.

## Roadmap (poza MVP)

Pełny plan rozwoju wraz z decyzjami technicznymi: [ROADMAP.md](ROADMAP.md).

W skrócie: PostgreSQL + Drizzle i konta użytkowników, asynchroniczny judging na Redis + BullMQ
z osobnym workerem, SSE z postępem per testcase, panel admina z zestawami zadań, moduł
konkursowy z regułami ICPC i live leaderboardem, na końcu rozbicie monolitu na mikroserwisy.
