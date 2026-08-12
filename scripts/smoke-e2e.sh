#!/usr/bin/env bash
# Smoke test całej ścieżki na działającym stacku: rejestracja → submit →
# ocenianie przez workera i prawdziwe Judge0 → werdykt w historii.
#
# Wymaga: docker compose up -d (i zaseedowanych zadań).
# Użycie: ./scripts/smoke-e2e.sh [API_URL]

set -euo pipefail

API="${1:-http://127.0.0.1:3001}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

# Unikalny adres, żeby skrypt dało się puścić wielokrotnie na tej samej bazie.
EMAIL="smoke-$(date +%s)@example.com"
PASSWORD="bardzo-tajne-haslo-smoke"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "== /health =="
curl -sf "$API/health" > /dev/null || fail "API nie odpowiada na $API"
echo "ok"

echo "== rejestracja ($EMAIL) =="
code=$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"Smoke\"}" \
  "$API/api/auth/register")
[ "$code" = "201" ] || fail "rejestracja zwróciła $code"
echo "ok"

echo "== /api/auth/me =="
curl -sf -b "$JAR" "$API/api/auth/me" > /dev/null || fail "sesja nie działa"
echo "ok"

echo "== lista zadań =="
# Celowo konkretne zadanie, nie „pierwsze z brzegu" — poniżej wysyłamy
# rozwiązanie a+b, więc werdykt ma znaczenie tylko dla tego zadania.
problems=$(curl -sf "$API/api/problems")
[ -n "$problems" ] || fail "brak odpowiedzi z /api/problems"
echo "$problems" | grep -q '"slug":"a-plus-b"' ||
  fail "brak zadania a-plus-b — uruchom: npm run seed:problems"
slug="a-plus-b"
echo "ok ($slug)"

echo "== submit =="
# a-plus-b: wczytaj dwie liczby, wypisz sumę.
source_code='import sys\na,b=map(int,sys.stdin.read().split())\nprint(a+b)'
response=$(curl -sf -b "$JAR" -H 'Content-Type: application/json' \
  -d "{\"problemSlug\":\"$slug\",\"language\":\"python\",\"source\":\"$source_code\"}" \
  "$API/api/submissions")
id=$(echo "$response" | sed -n 's/.*"submissionId":"\([^"]*\)".*/\1/p')
[ -n "$id" ] || fail "brak submissionId w odpowiedzi: $response"
echo "ok ($id)"

echo "== ocenianie (czekam do 120 s) =="
for _ in $(seq 1 60); do
  body=$(curl -sf -b "$JAR" "$API/api/submissions/$id")
  status=$(echo "$body" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
  if [ "$status" = "DONE" ] || [ "$status" = "FAILED" ]; then
    break
  fi
  sleep 2
done

verdict=$(echo "$body" | sed -n 's/.*"verdict":"\([^"]*\)".*/\1/p')
echo "status=$status verdict=$verdict"

[ "$status" = "DONE" ] || fail "submit utknął w stanie $status — sprawdź logi workera"
[ "$verdict" = "AC" ] || fail "oczekiwano AC, jest $verdict"

echo
echo "SMOKE OK — kolejka, worker i Judge0 działają end-to-end"
