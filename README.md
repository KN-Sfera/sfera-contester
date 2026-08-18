# Sfera Contester

A self-hosted contester for algorithmic contests: accounts, durable submission history,
asynchronous judging through a queue, an admin panel for authoring problems and tests, problem
sets, and a contest module with ICPC rules and a live leaderboard. Code runs inside **Judge0 CE**
(Isolate in Docker).

Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md). Frontend rebuild plan:
[docs/FRONTEND-PLAN.md](docs/FRONTEND-PLAN.md).

## Stack

- **api** — Fastify + TypeScript (`apps/api`)
- **worker** — the process that judges submissions off the queue (`apps/worker`)
- **web** — Next.js App Router, Monaco / CodeMirror (`apps/web`)
- **judge0** — self-hosted CE 1.13.1 (never exposed outside the compose network)
- **PostgreSQL** — the application database, separate from Judge0's internal one
- **Redis + BullMQ** — the judging queue and the progress bus

## Quick start (Docker)

Requirements: a running **Docker Desktop** (or another daemon) able to run `privileged`
containers (Judge0 / Isolate). On Apple Silicon the Judge0 images start as `linux/amd64`.

```bash
# 1. Start Docker Desktop
# 2. Prepare the secrets:
cp .env.example .env && openssl rand -base64 48   # paste the result as JWT_SECRET
# 3. From the project directory:
docker compose up --build
```

Then:

- UI: http://localhost:3000
- API: http://localhost:3001/health

A smoke test of Judge0 alone (once the Judge0 stack is up):

```bash
npm run smoke:judge0
```

The Judge0 API is exposed only on `127.0.0.1:2358` (localhost), never on the LAN. Inside the
compose network `api` reaches it at `http://judge0-server:2358`.

Judge0's first start (database migrations) can take a minute or two. If `/api/run` returns a
connection error, wait and try again.

## Local development (API and web outside Docker)

1. Start Judge0, the database and Redis:

```bash
docker compose up -d judge0-server judge0-worker judge0-db judge0-redis app-db app-redis
npm run smoke:judge0
```

2. Install the dependencies and run the API, the worker and the web app (each in its own
   terminal):

```bash
npm install
DATABASE_URL=postgres://sfera:sfera@127.0.0.1:5433/sfera REDIS_URL=redis://127.0.0.1:6379 JWT_SECRET=$(openssl rand -base64 48) COOKIE_SECURE=false JUDGE0_URL=http://127.0.0.1:2358 PROBLEMS_DIR=./data/problems npm run dev:api
DATABASE_URL=postgres://sfera:sfera@127.0.0.1:5433/sfera REDIS_URL=redis://127.0.0.1:6379 JUDGE0_URL=http://127.0.0.1:2358 npm run dev:worker
npm run dev:web
```

The API runs its migrations on start, so there is no need to apply them by hand. The database
starts empty — problems are loaded with the seed:

```bash
DATABASE_URL=postgres://sfera:sfera@127.0.0.1:5433/sfera npm run seed:problems
```

Without an explicit `NEXT_PUBLIC_API_URL` the frontend talks to the API on the host the page came
from, port 3001. That matters: the session cookie is `SameSite=Lax`, and `localhost` and
`127.0.0.1` are different sites to a browser, so a hard-coded host would mean the cookie is never
sent.

## Database

The application has its **own** Postgres (`app-db`, port `127.0.0.1:5433`), separate from the one
Judge0 uses internally. The Drizzle schema lives in `packages/db/src/schema/`.

```bash
npm run db:generate   # after a schema change — generates SQL into packages/db/drizzle/
npm run db:migrate    # applying migrations by hand (the API does the same on start)
```

The generated SQL is never edited by hand — change the schema and regenerate.

## Accounts

Email and password registration, argon2id, a session in an httpOnly cookie (`sfera_session`).
Roles: `USER` / `ADMIN`.

- `POST /api/auth/register` — `{ email, password, displayName }`, password at least 10 characters
- `POST /api/auth/login` — `{ email, password }`
- `POST /api/auth/logout` — clears the cookie on this device
- `POST /api/auth/logout-all` — voids **every** session the user has
- `GET /api/auth/me` — the signed-in profile

`REGISTRATION_MODE` decides who may create an account: `open`, `invite` (admin only — contest
mode), `closed`. The first admin:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=your-long-password npm run seed:admin
```

Sessions are voided by the `users.token_version` counter — bumping it kills every issued token
without keeping a list of them on the server.

## Submissions

Judging is **asynchronous**: the API stores the submission, pushes it onto the BullMQ queue and
answers `202` immediately. A separate process (`apps/worker`) judges it, stopping at the first
failing test.

- `POST /api/submissions` — `{ problemSlug, language, source }` → `202 { submissionId }`
- `GET /api/submissions` — your own submission history
- `GET /api/submissions/:id` — details with per-test results
- `GET /api/submissions/:id/events` — an SSE stream of judging progress

The stream emits `started`, `test` (number and verdict), and finally `done` or `failed` before
closing. A submission judged before the client connects gets its verdict straight from the
database — otherwise the browser would hang waiting for an event that will never come.

All of these require a session. Someone else's submission returns `404`, not `403` — the endpoint
must not be an oracle for which ids exist. Per-test results carry the number, verdict, time and
memory, but **not** `stderr` or compiler output, because on hidden tests those can leak the input.

`JUDGE_CONCURRENCY` sets how many submissions the worker judges in parallel. The ceiling is the
number of Judge0 workers — going higher only floods the sandbox.

## Admin panel

Everything under `/api/admin/*`, requiring the `ADMIN` role.

- `GET/POST /api/admin/problems`, `PATCH/DELETE /api/admin/problems/:slug` — problem CRUD
- `PUT /api/admin/problems/:slug/test-cases` — replaces the whole test set
- `POST /api/admin/problems/:slug/validate` — runs the reference solution through every test
- `POST /api/admin/problems/:slug/publish` — publishes, but **only if the reference passes**
- `POST /api/admin/problems/:slug/unpublish`

**A new problem always starts as a draft.** Publishing requires a reference solution that passes
the full test set — this catches the most common authoring mistake, a wrong `expected_output`.
Validation happens at publish time rather than being stored as a flag: a stored flag would go
stale after the first test edit.

Unlike submission judging, validation **does not stop at the first failure** — an admin wants to
see every problem at once. For failing tests the response includes the expected and the actual
output.

## Problem sets

Collections of problems: learning paths, contest archives, practice sets. A problem can belong to
many sets, but only once within a set.

- `GET /api/problem-sets` — public sets; with progress (`solvedCount`) when signed in
- `GET /api/problem-sets/:slug` — contents in order, with solved problems marked
- `GET/POST /api/admin/problem-sets`, `PATCH/DELETE /api/admin/problem-sets/:slug`
- `PUT /api/admin/problem-sets/:slug/items` — contents and order, from a list of slugs

Unpublished problems are skipped in the public view and do not inflate the progress denominator.

## ICPC contests

The rules are contest parameters rather than constants in code: `penaltyMinutes` (20 by default),
`freezeMinutes` (60), `compileErrorCountsAsAttempt` (false — as at the ICPC World Finals).

**The scoring lives in [`packages/shared/src/scoring/icpc.ts`](packages/shared/src/scoring/icpc.ts)
as a pure function with no I/O** and is covered by 26 unit tests. It is the most error-prone piece
of the system, so it has to be checkable without a database and without a sandbox.

Ranking: more problems solved ranks higher → lower total penalty → earlier last solve. A problem's
time is the minutes from the start to the accepted submission plus a penalty for each failed
attempt **before** it. Attempts after solving, and attempts at unsolved problems, cost nothing. A
tie left unresolved gives a shared position.

**The contest phase is not stored in the database** — it follows from `starts_at` and
`duration_minutes`. A status column would need a scheduled job and could drift out of step with
the clock. Time is always kept by the server; the browser only displays it.

Contestant endpoints:

- `GET /api/contests`, `GET /api/contests/:slug` — overview with the clock and the phase
- `POST /api/contests/:slug/register`
- `POST /api/contests/:slug/submissions` — `{ letter, language, source }`, at a higher priority
  than practice submissions
- `GET /api/contests/:slug/leaderboard` and `.../leaderboard/events` (SSE, live)
- `GET/POST /api/contests/:slug/clarifications`

Administration: contest CRUD, `PUT .../problems` (letters A, B, C… by order), participant
management, announcements, answers to questions, `GET .../leaderboard.csv`.

Three things the server enforces:

- **The problem list is hidden before the start.** If it leaked, one could prepare before the
  signal. Admins always see it.
- **The freeze.** During the last `freezeMinutes` the public scoreboard shows the pre-freeze
  state; an admin sees the real one. `PATCH` with `unfrozen: true` releases the results after the
  contest.
- **Submissions only inside the contest window and only from registered contestants.** Outside the
  window, a `409` saying whether the contest has not started or is already over.

The live leaderboard recomputes the ranking **once per contest and view variant**, not once per
client — with a hundred people watching the board that is one query per cycle instead of a
hundred. It sends only when the result actually changed.

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

Languages: `c`, `cpp`, `clang`, `clangpp`, `python`.

When `expectedStdout` is given, the API compares the normalised stdout → `AC` / `WA`.

### `POST /api/run-samples`

```json
{
  "language": "python",
  "source": "...",
  "problemSlug": "a-plus-b"
}
```

Runs the problem's sample test cases.

### `GET /api/problems` / `GET /api/problems/:slug`

The list and the details of published problems. Hidden tests never appear in either.

## Troubleshooting (macOS / SE Internal Error)

If Run Code returns **SE** / `Internal Error` with a message along the lines of
`No such file or directory @ rb_sysopen - /box/...`, then Isolate (the Judge0 sandbox) is not
working — usually because Docker Desktop uses **cgroup v2** while Judge0 1.13.x requires
**cgroup v1**.

The fix:

```bash
./scripts/fix-macos-cgroup.sh
# then: Quit Docker Desktop → start it again →
docker compose down && docker compose up -d
npm run smoke:judge0
```

By hand: in `~/Library/Group Containers/group.com.docker/settings-store.json` set
`"DeprecatedCgroupv1": true`, restart Docker Desktop and rebuild the stack.

## Security

- Judge0 runs privileged — keep it inside the internal compose network only.
- Rate limits on `/api/run` and `/api/run-samples`.
- Source and stdin size limits in `@sfera/shared`.
- The image is pinned to `judge0/judge0:1.13.1` (sandbox escape patches).

## Tests

```bash
npm run typecheck          # tsc over sources and tests
npm test                   # unit and component tests, no Docker needed
npm run test:integration   # Testcontainers — requires a running Docker
```

Vitest, with no build step first — the tests import `@sfera/shared` and `@sfera/db` straight from
source (aliases in the configs). The split:

- **unit and component** (`*.test.ts`, `*.test.tsx`) — pure logic and React components without
  I/O: the comparer, verdict mapping, ICPC scoring, token contrast, the test strip.
- **integration** (`*.integration.test.ts`) — a real Postgres in a container. Migrations,
  integrity constraints, seeding, and the endpoints through `app.inject()` with the database
  injected into `buildApp()`. Kept out of `npm test`, because they need Docker.

Testcontainers runs with Ryuk disabled (`TESTCONTAINERS_RYUK_DISABLED`) — it is the reaper
container pulled from Docker Hub on every start, and without Hub access it blocks the whole suite.
We close containers explicitly in `afterAll`, so the only thing lost is cleanup after the test
process is hard-killed. If any are left behind:

```bash
docker ps -aq --filter 'label=org.testcontainers=true' | xargs -r docker rm -f
```

The tests need a local `postgres:16.2` image (`docker pull postgres:16.2`).

## Layout

```
apps/worker            the process that judges submissions off the queue
apps/api               the Fastify backend
  src/app.ts             buildApp() — a Fastify instance without listen
  src/server.ts          bootstrap and listen
  src/config.ts          the environment, validated with zod
  src/modules/*          repository → service → routes
apps/web               the Next.js frontend
  src/app/               App Router: (auth) and (app) route groups
  src/components/ui      the component library
  src/components/domain  problem list, workspace, test strip, verdict
  src/components/editor  the editor facade: Monaco and CodeMirror
  src/lib/               API client, session, motion, formatting
packages/db            the Drizzle schema, client and migrations
packages/judge0        the Judge0 client and verdict mapping
packages/queue         JudgeQueue (BullMQ) and the progress bus
packages/shared        types, languages, the comparer, ICPC scoring
data/problems          problem seeds (JSON)
docker/judge0          judge0.conf
```

More context: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md).
