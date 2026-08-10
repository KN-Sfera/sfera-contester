# Architecture — Sfera Sandbox MVP

## Przepływ

```
Browser (Monaco)
    │  HTTP
    ▼
Fastify API  ──►  Judge0 CE (Isolate)
    │
    └── data/problems/*.json
```

1. UI wysyła kod + opcjonalnie stdin / expected / problem slug.
2. API mapuje język na `language_id` Judge0 i woła `POST /submissions?wait=true`.
3. Wynik jest mapowany na werdykt (`OK`, `AC`, `WA`, `CE`, `RE`, `TLE`, `MLE`, `SE`).
4. Comparer (trim końców linii) decyduje o `AC`/`WA` gdy jest expected output.

## Dlaczego Judge0

Judge0 opakowuje Isolate (IOI) i dostarcza REST API z kompilatorami (gcc, g++, clang, python).
Nie budujemy własnego sandboxa w MVP.

## Roadmap (poza MVP)

- Auth + historia runów (PostgreSQL)
- Redis + BullMQ (async judging)
- Ukryte testy, special judge
- Contesty / virtual scoreboard
- SSE progress per testcase
