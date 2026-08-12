# Roadmap — Sfera Contester

## Kontekst

Dziś w repo stoi działający sandbox MVP: Next.js + Monaco (`apps/web`), Fastify (`apps/api`),
Judge0 CE 1.13.1 w `docker-compose.yml`, wspólne typy w `packages/shared`. Zadania są plikami
JSON w `data/problems/`, ocenianie jest synchroniczne (`POST /submissions?wait=true` prosto
z requestu HTTP), nie ma bazy aplikacyjnej, użytkowników ani historii submitów. Cały backend
to jeden plik `apps/api/src/index.ts` z handlerami inline.

Cel: rozwinąć to w self-hosted contester w duchu LeetCode + ICPC — konta, trwała historia,
asynchroniczny judging przez kolejkę, panel admina do definiowania zadań i testów, zestawy
zadań oraz moduł konkursowy z leaderboardem na żywo i regułami ICPC. Docelowo monolit zostaje
rozbity na mikroserwisy.

Pięć faz. Każda kończy się czymś, co da się uruchomić i zwalidować. Fazy 4 i 5 są opisane
na poziomie architektury — doprecyzujemy je, gdy do nich dojdziemy.

## Decyzje techniczne

| Obszar | Decyzja |
|---|---|
| Backend | Node/TypeScript, Fastify |
| Frontend | React + TypeScript (Next.js App Router), Tailwind, Anime.js do animacji |
| Baza | PostgreSQL 16, osobna instancja od wewnętrznej bazy Judge0 |
| ORM | Drizzle ORM + drizzle-kit (migracje) |
| Kolejka | Redis + BullMQ (własny Redis, nie ten od Judge0) |
| Auth | email + hasło (argon2id), JWT, role `USER` / `ADMIN` |
| Realtime | SSE — live leaderboard + postęp submitu test po teście |
| Reguły konkursu | ICPC z parametrami w tabeli `contests` (kara, freeze, czas trwania) |
| Testy | Vitest, TDD; integracyjne na Testcontainers (Postgres + Redis) |
| Deployment | jeden host, `docker compose`, ~50–100 zawodników |

Świadomie **poza zakresem**: współdzielona edycja kodu w drużynie, scoring punktowy
IOI/Codeforces, zadania wieloplikowe, OAuth.

---

## Faza 0 — Porządek pod fundament

Mała faza przygotowawcza. Bez niej każda kolejna zmiana pogłębia bałagan w `index.ts`.

- Vitest w monorepo (root config + workspace per paczka). Pierwsze testy pokrywają istniejącą
  logikę: `normalizeOutput` / `compareOutputs` z [`packages/shared/src/index.ts`](../packages/shared/src/index.ts)
  oraz `mapVerdict` z [`apps/api/src/judge0.ts`](../apps/api/src/judge0.ts) (dziś nieeksportowane).
- Rozbić [`apps/api/src/index.ts`](../apps/api/src/index.ts) na warstwy, zachowując dokładnie to
  samo zachowanie API:

  ```
  apps/api/src/
    app.ts                 budowa instancji Fastify (testowalna bez listen)
    server.ts              bootstrap + listen
    config.ts              env przez zod, jedno miejsce
    modules/
      problems/{routes,service,repository}.ts
      runs/{routes,service}.ts        obecne /api/run, /api/run-samples
    judge0/client.ts       przeniesione judge0.ts
  ```

  `buildApp()` zwracające instancję Fastify jest warunkiem sensownych testów endpointów
  (`app.inject`).
- Ujednolicić werdykt `ACC` vs `AC`: `packages/shared` używa `ACC`, dokumentacja mówi `AC`.
  Wybieramy `AC` (nazewnictwo ICPC), póki nie ma bazy z zapisanymi wartościami.

**Walidacja:** `npm test` zielony, `docker compose up` działa jak dotąd, UI bez zmian.

---

## Faza 1 — Fundament: baza, konta, kolejka

### 1.1 Postgres + Drizzle

Nowa paczka `packages/db` (schemat + migracje + klient), żeby w Fazie 5 dało się ją
współdzielić między serwisami.

```
packages/db/src/
  schema/{users,problems,testcases,submissions,submission-results,problem-sets}.ts
  client.ts        pool + drizzle()
  migrate.ts       runner odpalany przy starcie API
drizzle/           wygenerowane migracje SQL (commitowane)
```

Zarys schematu:

- `users` — `id uuid`, `email unique`, `password_hash`, `display_name`, `role`, `created_at`
- `problems` — `id`, `slug unique`, `title`, `statement`, `time_limit`, `memory_limit`,
  `is_public`, `created_by`, timestamps
- `test_cases` — `id`, `problem_id fk`, `ordinal`, `input text`, `expected_output text`,
  `is_sample bool`, `points` (na zapas)
- `submissions` — `id`, `user_id`, `problem_id`, `contest_id nullable`, `language`,
  `source text`, `status` (`QUEUED`/`RUNNING`/`DONE`/`FAILED`), `verdict`, `max_time`,
  `max_memory`, `created_at`, `judged_at`
- `submission_results` — wynik per testcase: `submission_id`, `test_case_id`, `verdict`,
  `time`, `memory`, `stderr`, `compile_output`

Indeksy od razu: `submissions(contest_id, user_id, problem_id, created_at)` — to jest
zapytanie leaderboardu.

Do compose dochodzi `app-db` (Postgres 16, własny wolumen). **Nie** wpinamy się w `judge0-db` —
Judge0 zarządza swoim schematem sam i miesza się z migracjami.

### 1.2 Migracja zadań z JSON do bazy

`data/problems/*.json` zostaje jako **format seedowy**, nie źródło prawdy w runtime. Skrypt
`npm run seed:problems` czyta katalog (reuse logiki z [`apps/api/src/problems.ts`](../apps/api/src/problems.ts))
i wstawia/aktualizuje zadania po `slug`. Repozytorium zadań przechodzi na Drizzle; publiczne
endpointy `/api/problems` i `/api/problems/:slug` zachowują dotychczasowy kształt odpowiedzi,
żeby `apps/web` nie wymagał zmian.

Ważne od razu: `GET /api/problems/:slug` **nigdy** nie zwraca testów niebędących samplami. Dziś
filtruje to handler; po przejściu na bazę filtr musi żyć w repozytorium (`where is_sample = true`),
żeby nie dało się go przypadkiem obejść.

### 1.3 Auth

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Hasła: argon2id.
- **Jedna sesja w httpOnly cookie (SameSite=Lax), bez pary access + refresh.** Podział na dwa
  tokeny ma sens, gdy access token trafia do JavaScriptu albo krąży między wieloma serwisami —
  tutaj token nigdy nie opuszcza cookie i rozmawia z jednym backendem, więc rotacja i wykrywanie
  ponownego użycia byłyby złożonością bez zysku. Unieważnianie robi kolumna `token_version`
  na użytkowniku: wylogowanie ze wszystkich urządzeń i zmiana hasła podbijają licznik, co
  natychmiast zabija wszystkie wydane tokeny. Do pary access + refresh wracamy, jeśli w Fazie 5
  token zacznie krążyć między serwisami.
- Fastify decorator `requireAuth` / `requireRole('ADMIN')` jako preHandler, nie ręczne
  sprawdzanie w każdym handlerze.
- Przełącznik `REGISTRATION_MODE=open|invite|closed` — na konkursie chcemy `invite`. Pierwszy
  admin z `npm run seed:admin`.
- Ostrzejszy rate limit na `/api/auth/login` niż globalny.

### 1.4 Asynchroniczny judging na BullMQ

Serce fazy. Dziś `executeCode` blokuje request HTTP na czas kompilacji i wykonania — przy
50 osobach submitujących naraz to się kładzie.

```
POST /api/submissions ──► zapis submission (QUEUED) ──► queue.add('judge', {submissionId})
      │                                                          │
      └──► 202 { submissionId }                                  ▼
                                                        apps/worker (osobny proces)
                                                          pobiera testy z DB
                                                          dla każdego → Judge0
                                                          zapis submission_results
                                                          publish progres → Redis pub/sub
                                                          finalny verdict → submissions
```

- Nowa paczka `apps/worker` — osobny proces i osobny kontener w compose. Osobny od startu, bo
  to naturalna granica pierwszego mikroserwisu w Fazie 5.
- Kolejka schowana za interfejsem `JudgeQueue` (`enqueue`, `on progress`) — implementacja
  BullMQ wymienna na RabbitMQ bez ruszania warstwy domeny.
- Reguła ICPC: **przerywamy na pierwszym niezaliczonym teście**, zapisujemy jego numer.
- Priorytety BullMQ: submit konkursowy > zwykły submit > „uruchom na samplach". Concurrency
  workera dopasowana do liczby workerów Judge0, żeby nie zalewać sandboxa.
- Retry tylko dla błędów infrastrukturalnych (`SE`, Judge0 nieosiągalny) — nigdy dla `WA`/`RE`,
  bo to poprawny wynik.
- `executeCode` przenosi się do workera niemal bez zmian; zostają limity rozmiaru i mapowanie
  werdyktów.

`POST /api/run` (playground, bez zapisu) zostaje synchroniczne — inny przypadek użycia i wygodna
ścieżka awaryjna.

### 1.5 SSE — postęp submitu

- `GET /api/submissions/:id/events` (SSE) — zdarzenia `{ testIndex, total, verdict }`, na końcu
  `done`.
- Worker publikuje na Redis pub/sub, API subskrybuje i przekazuje klientowi. Ta warstwa
  pośrednia pozwala workerowi i API stać na różnych procesach (w Fazie 5 — na różnych hostach).
- Autoryzacja: własny submit widzi autor, cudzy tylko admin.
- Front: hook `useSubmissionProgress(id)`, pasek „Test 3/20".

### 1.6 UI Fazy 1

Świadome minimum — pełna przebudowa frontendu to Faza 3, tu chodzi tylko o to, żeby dało się
przeklikać nowy backend. Nie inwestujemy w wygląd czegoś, co i tak zostanie przepisane:
logowanie/rejestracja, lista zadań z oznaczeniem rozwiązanych,
strona zadania z Monaco ([`apps/web/src/app/page.tsx`](../apps/web/src/app/page.tsx) rozbite na
`/problems` i `/problems/[slug]`), historia własnych submitów, widok submitu z wynikami per test.

### Walidacja Fazy 1

- Jednostkowe: comparer, mapowanie werdyktów, polityka retry, hashowanie haseł.
- Integracyjne na Testcontainers: rejestracja→login→submit→werdykt zapisany; ukryte testy nie
  wyciekają przez API; worker konsumuje kolejkę i zapisuje wyniki.
- Ręcznie: `docker compose up`, submit `a-plus-b`, postęp na żywo, wynik w historii po
  odświeżeniu.
- Obciążeniowo: 30 równoległych submitów — kolejka się nie zatyka, API odpowiada.

---

## Faza 2 — Panel admina i zestawy zadań

- **CRUD zadań** dla `ADMIN`: treść w Markdown z podglądem, limity, testy dodawane pojedynczo
  lub wgrywane jako ZIP w konwencji `1.in`/`1.out` (standard ICPC — pozwala wrzucić gotowe
  paczki z archiwów).
- **Walidacja zadania przed publikacją**: admin wgrywa wzorcowe rozwiązanie, system przepuszcza
  je przez wszystkie testy i nie pozwala opublikować zadania, którego wzorcówka nie przechodzi.
  Wyłapuje najczęstszy błąd — zły `expected_output`.
- **Zestawy zadań**: `problem_sets` + `problem_set_items` (kolejność), publiczne lub prywatne,
  z postępem użytkownika. Zadanie może należeć do wielu zestawów.
- Import/eksport zadania jako JSON — zgodny z formatem `data/problems/`.

---

## Faza 3 — Przebudowa frontendu

Do tej pory UI był doklejany minimalnym kosztem — jeden plik `page.tsx`, zero responsywności,
brak systemu. Moduł konkursowy z Fazy 4 ma najwięcej ekranów w całej aplikacji (leaderboard,
zegar, ogłoszenia, widok zadania pod presją czasu), więc przebudowa idzie **przed** nim.
Budowanie konkursu na obecnym UI oznaczałoby pisanie go dwa razy.

### 3.1 Fundament

- **React + TypeScript w trybie strict** na Next.js App Router — stack zostaje, zmienia się
  sposób pisania. Koniec z jednym plikiem: komponenty z jasną odpowiedzialnością, `use client`
  tylko tam, gdzie naprawdę potrzeba interaktywności.
- **Design tokens** (kolory, typografia, odstępy, promienie, cienie) jako zmienne CSS + config
  Tailwinda. Jedno źródło prawdy; komponenty nie zawierają wartości dosłownych.
- **Biblioteka komponentów** w `apps/web/src/components/ui/` — button, input, select, badge
  werdyktu, tabela, dialog, toast, skeleton. Każdy z wariantami i stanami (hover, focus,
  disabled, loading).

### 3.2 Responsywność

Mobile-first, breakpointy Tailwinda. Trudny przypadek to **strona zadania**: na desktopie split
pane (treść | edytor | wyniki), na mobile te trzy panele stają się zakładkami — próba upchnięcia
splitu na 375 px daje edytor nie do użytku.

Monaco waży ~1 MB i na telefonie działa źle (brak wsparcia dla klawiatur ekranowych, kiepskie
zaznaczanie). Decyzja do podjęcia na starcie fazy: albo CodeMirror 6 na małych ekranach, albo
Monaco tylko od `md` w górę, a niżej podgląd kodu bez edycji. Nikt nie pisze rozwiązania ICPC
na telefonie — ale leaderboard i treść zadania ogląda się na nim jak najbardziej.

### 3.3 Animacje — Anime.js

Anime.js v4 jako jedyna biblioteka animacji. Zasada: **animacja komunikuje zmianę stanu, nie
zdobi**. Konkretne zastosowania, wszystkie na czymś, co faktycznie się dzieje:

- **Pasek postępu submitu** — wypełnianie w takt zdarzeń SSE z 1.5, licznik „Test 3/20"
  animowany między wartościami zamiast przeskakiwać.
- **Leaderboard** — przy zmianie kolejności wiersze przejeżdżają na nowe pozycje (FLIP), zamiast
  przeskakiwać. Bez tego przy live update nie widać, kto kogo wyprzedził. To jest ten moment,
  dla którego ludzie patrzą na ranking.
- **Feedback werdyktu** — krótkie podświetlenie AC/WA po powrocie wyniku.
- **Odsłonięcie po freeze** — animowane rozwinięcie ukrytych wyników po zakończeniu konkursu.
- **Skeletony i przejścia listy** przy ładowaniu.

Twarde wymagania: każda animacja respektuje `prefers-reduced-motion` (wyłączamy ruch, zostawiamy
zmianę stanu), nic nie animuje właściwości wymuszających layout — tylko `transform` i `opacity`,
i żadna animacja nie blokuje interakcji ani nie opóźnia pokazania danych.

### 3.4 Ekrany

Logowanie i rejestracja, lista zadań z filtrami i statusem rozwiązania, strona zadania,
historia submitów, widok pojedynczego submitu z wynikami per test, panel admina (Faza 2
dostaje wtedy porządny UI), leaderboard i ekran konkursu (przygotowane pod Fazę 4).

### 3.5 Dostępność i testy

- Kontrast WCAG AA, widoczny focus, pełna obsługa klawiaturą, sensowna struktura nagłówków.
  Contester bez klawiatury nie ma sensu — to narzędzie dla ludzi, którzy nie odrywają rąk.
- Vitest + Testing Library na komponentach, Playwright na ścieżkach krytycznych: logowanie,
  submit, podgląd wyniku.

**Walidacja:** ścieżki krytyczne przechodzą na 375 px i 1440 px, Playwright zielony,
`prefers-reduced-motion` faktycznie wycisza animacje, Lighthouse bez regresji wydajności.

---

## Faza 4 — Moduł konkursowy ICPC

Tabele: `contests` (`starts_at`, `duration_minutes`, `penalty_minutes` domyślnie 20,
`freeze_minutes` domyślnie 60, `visibility`, `status`), `contest_problems` (kolejność +
litera A/B/C…), `contest_participants` (użytkownik lub drużyna, `is_official`), `clarifications`.

**Scoring jako czysta funkcja** w `packages/shared/src/scoring/icpc.ts` — bierze listę submitów
i parametry konkursu, zwraca ranking. Zero I/O, w pełni pokryte testami jednostkowymi. To
najbardziej podatny na błędy kawałek systemu i musi dać się przetestować bez bazy.

Reguły:

- Ranking po liczbie rozwiązanych zadań malejąco, przy remisie po sumie czasu rosnąco.
- Czas zadania = minuty od startu konkursu do zaakceptowanego submitu + `penalty_minutes` ×
  liczba **błędnych** submitów **przed** tym AC.
- Błędne submity po AC oraz do zadań nierozwiązanych nie liczą się do kary.
- Kompilacja nieudana — konfigurowalne, czy liczy się jako błędny submit (w ICPC WF nie liczy się).
- Freeze: przez ostatnie `freeze_minutes` publiczny leaderboard nie pokazuje zmian; admin widzi
  prawdziwy stan. Po konkursie „rozmrożenie".
- Tie-break ostateczny: czas ostatniego AC.

Dalej: zegar konkursu synchronizowany z serwerem (nie z zegarem przeglądarki), live leaderboard
po SSE, ogłoszenia i clarifications od admina, tryb wirtualny (przejście archiwalnego konkursu
we własnym czasie), eksport wyników do CSV.

Kolejność w obrębie fazy: model danych + scoring z testami → rejestracja na konkurs i submity
konkursowe → leaderboard statyczny → freeze → live przez SSE → clarifications.

---

## Faza 5 — Rozbicie na mikroserwisy

Dopiero gdy Fazy 1–4 działają i mają testy. Granice są przygotowane wcześniej: `apps/worker`
jest osobnym procesem od Fazy 1, kolejka siedzi za interfejsem, `packages/db` jest współdzielony.

Docelowy podział:

- **gateway** — auth, routing, SSE do przeglądarki
- **problems-service** — zadania, testy, zestawy
- **judge-service** — kolejka + workery + Judge0 (jedyny, który dotyka sandboxa)
- **contest-service** — konkursy, scoring, leaderboard

Wtedy sensowna staje się decyzja o wymianie BullMQ na RabbitMQ (topic exchange per typ
zdarzenia, dead-letter queue). Do tego: baza per serwis (albo przynajmniej schemat per serwis),
kontrakty API wersjonowane, tracing.

---

## Ryzyka

- **Judge0 wymaga cgroup v1** — na macOS trzeba `./scripts/fix-macos-cgroup.sh`, na nowych
  dystrybucjach Linuksa bywa tak samo. Docelowy host produkcyjny sprawdzić wcześnie, zanim
  Faza 4 będzie gotowa.
- **Judge0 działa jako `privileged`** — nie wolno go wystawiać poza sieć compose. Dziś jest
  poprawnie związany z `127.0.0.1:2358`; przy deployu sieciowym port musi zniknąć całkowicie.
- **Wyciek ukrytych testów** — najpoważniejsze ryzyko domenowe. Filtr `is_sample` w repozytorium
  i pokryty testem; `stderr`/`compile_output` z niepoprawnych rozwiązań mogą zdradzać dane
  wejściowe. W trakcie konkursu pokazujemy zawodnikowi tylko numer testu i werdykt.
- **Zegar** — czas konkursu zawsze liczony po stronie serwera; przeglądarka tylko wyświetla.
- **Wydajność Judge0** — realna przepustowość to liczba workerów × ~1 submit/s. Przy 100
  zawodnikach w ostatnich minutach konkursu kolejka urośnie. Priorytety w BullMQ pomagają, ale
  trzeba to zmierzyć w Fazie 1.
