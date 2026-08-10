# Sfera — Sandbox MVP

Wewnętrzny playground do odpalania i prymitywnego testowania kodu algorytmicznego.
Kod wykonuje się w **Judge0 CE** (Isolate w Dockerze).

## Stack

- **web** — Next.js + Monaco (`apps/web`)
- **api** — Fastify + TypeScript (`apps/api`)
- **judge0** — self-hosted CE 1.13.1 (nie publikowany na zewnątrz)
- **shared** — wspólne typy i comparer (`packages/shared`)

## Szybki start (Docker)

Wymagania: uruchomiony **Docker Desktop** (lub inny daemon) z możliwością kontenerów `privileged` (Judge0 / Isolate).
Na Apple Silicon obrazy Judge0 startują jako `linux/amd64`.

```bash
# 1. Uruchom Docker Desktop
# 2. Z katalogu projektu:
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

1. Odpal Judge0:

```bash
docker compose up -d judge0-server judge0-worker judge0-db judge0-redis
npm run smoke:judge0
```

2. Zainstaluj zależności i uruchom API + web:

```bash
npm install
JUDGE0_URL=http://127.0.0.1:2358 PROBLEMS_DIR=./data/problems npm run dev:api
NEXT_PUBLIC_API_URL=http://127.0.0.1:3001 npm run dev:web
```
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

## Struktura

```
apps/api          Fastify backend
apps/web          Next.js playground
packages/shared   typy, języki, comparer
data/problems     seed zadań (JSON)
docker/judge0     judge0.conf
```

Więcej kontekstu: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
