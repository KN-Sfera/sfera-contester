# Sfera Contester


Self-hosted contester algorytmiczny: konta, trwała historia submitów, asynchroniczne ocenianie
przez kolejkę, panel admina do definiowania zadań i testów, zestawy zadań oraz moduł konkursowy
z regułami ICPC i leaderboardem na żywo. Kod wykonuje się w **Judge0 CE** (Isolate w Dockerze).

Plan rozwoju: [docs/ROADMAP.md](docs/ROADMAP.md). Frontend czeka na przebudowę (Faza 3) —
backend jest kompletny.

## Stack

- **api** — Fastify + TypeScript (`apps/api`)
- **worker** — proces oceniający submity z kolejki (`apps/worker`)
- **web** — Next.js + Monaco (`apps/web`) — do przebudowy
- **judge0** — self-hosted CE 1.13.1 (nie publikowany na zewnątrz)
- **PostgreSQL** — baza aplikacyjna, osobna od wewnętrznej bazy Judge0
- **Redis + BullMQ** — kolejka oceniania i szyna postępu

## Szybki start (Docker)

Wymagania: uruchomiony **Docker Desktop** (lub inny daemon) z możliwością kontenerów `privileged` (Judge0 / Isolate).
Na Apple Silicon obrazy Judge0 startują jako `linux/amd64`.

```bash
# 1. Uruchom Docker Desktop
# 2. Przygotuj sekrety:
cp .env.example .env && openssl rand -base64 48   # wklej wynik jako JWT_SECRET
# 3. Z katalogu projektu:
docker compose up --build
```

Potem:

- UI: http://localhost:3000
- API: http://localhost:3001/health

Smoke test samego Judge0 (gdy stack Judge0 już stoi):

```bash
npm run smoke:judge0
```

Judge0 API jest wystawione tylko na `127.0.0.1:2358` (localhost) — nie na LAN. W sieci compose `api` łączy się przez `http://judge0-server:2358`.

Pierwszy start Judge0 (migracje DB) może zająć 1–2 minuty. Jeśli `/api/run` zwróci błąd połączenia, poczekaj i spróbuj ponownie.

## Dev lokalny (API + web poza Dockerem)

1. Odpal Judge0, bazę i Redisa:

```bash
docker compose up -d judge0-server judge0-worker judge0-db judge0-redis app-db app-redis
npm run smoke:judge0
```

2. Zainstaluj zależności i uruchom API, workera i web (każde w osobnym terminalu):

```bash
npm install
DATABASE_URL=postgres://sfera:sfera@127.0.0.1:5433/sfera REDIS_URL=redis://127.0.0.1:6379 JWT_SECRET=$(openssl rand -base64 48) COOKIE_SECURE=false JUDGE0_URL=http://127.0.0.1:2358 PROBLEMS_DIR=./data/problems npm run dev:api
DATABASE_URL=postgres://sfera:sfera@127.0.0.1:5433/sfera REDIS_URL=redis://127.0.0.1:6379 JUDGE0_URL=http://127.0.0.1:2358 npm run dev:worker
NEXT_PUBLIC_API_URL=http://127.0.0.1:3001 npm run dev:web
```

API odpala migracje przy starcie, więc nie trzeba ich uruchamiać ręcznie. Baza startuje pusta —
zadania wgrywa się seedem:

```bash
DATABASE_URL=postgres://sfera:sfera@127.0.0.1:5433/sfera npm run seed:problems
```

## Baza danych

Aplikacja ma **własnego** Postgresa (`app-db`, port `127.0.0.1:5433`), osobnego od tego,
którego Judge0 używa wewnętrznie. Schemat w Drizzle: `packages/db/src/schema/`.

```bash
npm run db:generate   # po zmianie schematu — generuje SQL do packages/db/drizzle/
npm run db:migrate    # ręczne zastosowanie migracji (API robi to samo przy starcie)
```

Wygenerowanego SQL-a nie edytuje się ręcznie — zmienia się schemat i generuje na nowo.

## Konta

Rejestracja email + hasło, argon2id, sesja w httpOnly cookie (`sfera_session`). Role:
`USER` / `ADMIN`.

- `POST /api/auth/register` — `{ email, password, displayName }`, hasło min. 10 znaków
- `POST /api/auth/login` — `{ email, password }`
- `POST /api/auth/logout` — czyści ciasteczko na tym urządzeniu
- `POST /api/auth/logout-all` — unieważnia **wszystkie** sesje użytkownika
- `GET /api/auth/me` — profil zalogowanego

`REGISTRATION_MODE` steruje tym, kto może założyć konto: `open`, `invite` (tylko admin —
tryb na konkurs), `closed`. Pierwszy admin:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=twoje-dlugie-haslo npm run seed:admin
```

Sesje unieważnia licznik `users.token_version` — podbicie go zabija wszystkie wydane tokeny
bez trzymania ich listy po stronie serwera.

## Submity

Ocenianie jest **asynchroniczne**: API zapisuje submit, wrzuca go do kolejki BullMQ i
natychmiast odpowiada `202`. Ocenia osobny proces (`apps/worker`), przerywając na pierwszym
niezaliczonym teście.

- `POST /api/submissions` — `{ problemSlug, language, source }` → `202 { submissionId }`
- `GET /api/submissions` — historia własnych submitów
- `GET /api/submissions/:id` — szczegóły z wynikami per test
- `GET /api/submissions/:id/events` — strumień SSE z postępem oceniania

Strumień wysyła `started`, `test` (numer + werdykt), a na koniec `done` albo `failed` i się
zamyka. Submit oceniony przed podłączeniem klienta dostaje werdykt od razu z bazy — inaczej
przeglądarka wisiałaby, czekając na zdarzenie, które już nie przyjdzie.

Wszystkie wymagają zalogowania. Cudzy submit daje `404`, nie `403` — endpoint nie może być
wyrocznią istnienia identyfikatorów. Wyniki per test zawierają numer, werdykt, czas i pamięć,
ale **nie** `stderr` ani wyjścia kompilatora, bo na ukrytych testach potrafią zdradzić dane
wejściowe.

`JUDGE_CONCURRENCY` ustawia, ile submitów worker ocenia równolegle. Sufit wyznacza liczba
workerów Judge0 — wyżej tylko zapycha sandbox.

## Panel admina

Wszystko pod `/api/admin/*`, wymaga roli `ADMIN`.

- `GET/POST /api/admin/problems`, `PATCH/DELETE /api/admin/problems/:slug` — CRUD zadań
- `PUT /api/admin/problems/:slug/test-cases` — podmiana kompletu testów
- `POST /api/admin/problems/:slug/validate` — przepuszcza wzorcówkę przez wszystkie testy
- `POST /api/admin/problems/:slug/publish` — publikuje, ale **tylko gdy wzorcówka przechodzi**
- `POST /api/admin/problems/:slug/unpublish`

**Nowe zadanie zawsze startuje jako szkic.** Publikacja wymaga podania wzorcowego rozwiązania,
które musi przejść komplet testów — to wyłapuje najczęstszy błąd przy zakładaniu zadania, czyli
złe `expected_output`. Walidacja dzieje się w momencie publikacji, a nie jest zapamiętywana jako
flaga: zapamiętana zdezaktualizowałaby się po pierwszej edycji testów.

W przeciwieństwie do oceniania submitów walidacja **nie przerywa na pierwszym błędzie** — admin
chce zobaczyć komplet problemów naraz. Dla testów, które padły, odpowiedź zawiera oczekiwane
i faktyczne wyjście.

## Zestawy zadań

Kolekcje zadań: ścieżki nauki, archiwa konkursów, zestawy ćwiczeń. Zadanie może należeć do wielu
zestawów, w jednym tylko raz.

- `GET /api/problem-sets` — publiczne zestawy; dla zalogowanych z postępem (`solvedCount`)
- `GET /api/problem-sets/:slug` — zawartość w kolejności, z oznaczeniem zaliczonych
- `GET/POST /api/admin/problem-sets`, `PATCH/DELETE /api/admin/problem-sets/:slug`
- `PUT /api/admin/problem-sets/:slug/items` — zawartość i kolejność wg listy slugów

Zadania nieopublikowane są pomijane w widoku publicznym i nie podbijają mianownika postępu.

## Konkursy ICPC

Reguły są parametrami konkursu, nie stałymi w kodzie: `penaltyMinutes` (domyślnie 20),
`freezeMinutes` (60), `compileErrorCountsAsAttempt` (false — jak na ICPC World Finals).

**Scoring żyje w [`packages/shared/src/scoring/icpc.ts`](packages/shared/src/scoring/icpc.ts)
jako czysta funkcja bez I/O** i jest pokryty 26 testami jednostkowymi. To najbardziej podatny
na błędy fragment systemu, więc musi dać się sprawdzić bez bazy i bez sandboxa.

Ranking: więcej rozwiązanych wyżej → niższa suma kar → wcześniejsze ostatnie zaliczenie.
Czas zadania to minuty od startu do AC plus kara za każdy błędny submit **przed** nim. Próby po
zaliczeniu i próby do zadań nierozwiązanych nie kosztują nic. Nierozstrzygnięty remis daje tę
samą pozycję.

**Faza konkursu nie jest trzymana w bazie** — wynika z `starts_at` i `duration_minutes`.
Kolumna ze statusem wymagałaby zadania cyklicznego i potrafiłaby się rozjechać z zegarem.
Czas zawsze liczy serwer; przeglądarka tylko wyświetla.

Endpointy zawodnika:

- `GET /api/contests`, `GET /api/contests/:slug` — przegląd z zegarem i fazą
- `POST /api/contests/:slug/register`
- `POST /api/contests/:slug/submissions` — `{ letter, language, source }`, priorytet wyższy
  niż submity ćwiczeniowe
- `GET /api/contests/:slug/leaderboard` i `.../leaderboard/events` (SSE, live)
- `GET/POST /api/contests/:slug/clarifications`

Administracja: CRUD konkursów, `PUT .../problems` (litery A, B, C… wg kolejności), zarządzanie
zawodnikami, ogłoszenia, odpowiedzi na pytania, `GET .../leaderboard.csv`.

Trzy rzeczy pilnowane po stronie serwera:

- **Lista zadań jest ukryta przed startem.** Gdyby wyciekała, dałoby się przygotować przed
  sygnałem. Admin widzi ją zawsze.
- **Freeze.** Przez ostatnie `freezeMinutes` publiczna tablica pokazuje stan sprzed zamrożenia;
  admin widzi prawdziwy. `PATCH` z `unfrozen: true` odmraża wyniki po zawodach.
- **Submit tylko w oknie konkursu i tylko dla zapisanych.** Poza oknem `409` z informacją,
  czy konkurs jeszcze nie ruszył, czy już się skończył.

Live leaderboard przelicza ranking **raz na konkurs i wariant widoku**, nie raz na klienta —
przy stu osobach wpatrzonych w tablicę to jedno zapytanie na cykl zamiast stu. Wysyła tylko
wtedy, gdy wynik się zmienił.

## API

### `POST /api/run`

```json
{
  "language": "cpp",
  "source": "...",
  "stdin": "1 2\n",
  "expectedStdout": "3\n"
}
```

Języki: `c`, `cpp`, `clang`, `clangpp`, `python`.

Gdy podasz `expectedStdout`, API porównuje znormalizowany stdout → `AC` / `WA`.

### `POST /api/run-samples`

```json
{
  "language": "python",
  "source": "...",
  "problemSlug": "a-plus-b"
}
```

Odpalane są sample testcases z `data/problems/*.json`.

### `GET /api/problems` / `GET /api/problems/:slug`

Lista i szczegóły zadań seedowanych w `data/problems/`.

## Troubleshooting (macOS / SE Internal Error)

Jeśli Run Code zwraca **SE** / `Internal Error` i message w stylu
`No such file or directory @ rb_sysopen - /box/...`, to Isolate (sandbox Judge0)
nie działa — zwykle bo Docker Desktop używa **cgroup v2**, a Judge0 1.13.x
wymaga **cgroup v1**.

Naprawa:

```bash
./scripts/fix-macos-cgroup.sh
# potem: Quit Docker Desktop → uruchom ponownie →
docker compose down && docker compose up -d
npm run smoke:judge0
```

Ręcznie: w `~/Library/Group Containers/group.com.docker/settings-store.json`
ustaw `"DeprecatedCgroupv1": true`, zrestartuj Docker Desktop, przebuduj stack.

## Bezpieczeństwo

- Judge0 działa w trybie privileged — trzymaj go tylko w wewnętrznej sieci compose.
- Rate limit na `/api/run` i `/api/run-samples`.
- Limity rozmiaru kodu / stdin w `@sfera/shared`.
- Image pinned do `judge0/judge0:1.13.1` (łatki sandbox escape).

## Testy

```bash
npm run typecheck          # tsc na źródłach i testach
npm test                   # jednostkowe, bez Dockera
npm run test:integration   # Testcontainers — wymaga działającego Dockera
```

Vitest, bez potrzeby wcześniejszego builda — testy importują `@sfera/shared` i `@sfera/db` prosto
ze źródeł (aliasy w configach). Podział:

- **jednostkowe** (`*.test.ts`) — czysta logika bez I/O: comparer, mapowanie werdyktów.
- **integracyjne** (`*.integration.test.ts`) — prawdziwy Postgres w kontenerze. Migracje, więzy
  integralności, seed oraz endpointy przez `app.inject()` z bazą wstrzykniętą do `buildApp()`.
  Poza `npm test`, bo wymagają Dockera.

Testcontainers ma wyłączonego Ryuka (`TESTCONTAINERS_RYUK_DISABLED`) — to kontener-sprzątacz
ściągany z Docker Huba przy każdym starcie, który bez dostępu do Huba blokuje cały zestaw.
Kontenery zamykamy jawnie w `afterAll`, więc jedyne, co tracimy, to sprzątanie po twardym
ubiciu procesu testów. Jeśli takie zostaną:

```bash
docker ps -aq --filter 'label=org.testcontainers=true' | xargs -r docker rm -f
```

Testy wymagają lokalnego obrazu `postgres:16.2` (`docker pull postgres:16.2`).

## Struktura

```
apps/worker            proces oceniający submity z kolejki
apps/api               Fastify backend
  src/app.ts             buildApp() — instancja Fastify bez listen
  src/server.ts          bootstrap + listen
  src/config.ts          env walidowany zodem
  src/judge0/client.ts   klient Judge0 i mapowanie werdyktów
  src/modules/problems   repository → service → routes
  src/modules/runs       service → routes
apps/web               Next.js playground
packages/db            schemat Drizzle, klient, migracje
packages/judge0        klient Judge0 i mapowanie werdyktów
packages/queue         JudgeQueue (BullMQ) i szyna postępu
packages/shared        typy, języki, comparer, scoring ICPC
data/problems          seed zadań (JSON)
docker/judge0          judge0.conf
```

Więcej kontekstu: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Plan rozwoju: [docs/ROADMAP.md](docs/ROADMAP.md).
