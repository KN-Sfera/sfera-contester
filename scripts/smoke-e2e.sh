#!/usr/bin/env bash
# Smoke test of the whole path against a running stack: register → submit →
# judged by the worker and real Judge0 → verdict in the history.
#
# Requires: docker compose up -d (and seeded problems).
# Usage: ./scripts/smoke-e2e.sh [API_URL]

set -euo pipefail

API="${1:-http://127.0.0.1:3001}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

# A unique address, so the script can be run repeatedly against one database.
EMAIL="smoke-$(date +%s)@example.com"
PASSWORD="smoke-test-password"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "== /health =="
curl -sf "$API/health" > /dev/null || fail "the API is not answering on $API"
echo "ok"

echo "== register ($EMAIL) =="
code=$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"Smoke\"}" \
  "$API/api/auth/register")
[ "$code" = "201" ] || fail "registration returned $code"
echo "ok"

echo "== /api/auth/me =="
curl -sf -b "$JAR" "$API/api/auth/me" > /dev/null || fail "the session does not work"
echo "ok"

echo "== problem list =="
# A specific problem on purpose, not "whichever comes first" — below we submit
# an a+b solution, so the verdict only means anything for that problem.
problems=$(curl -sf "$API/api/problems")
[ -n "$problems" ] || fail "no response from /api/problems"
echo "$problems" | grep -q '"slug":"a-plus-b"' ||
  fail "no a-plus-b problem — run: npm run seed:problems"
slug="a-plus-b"
echo "ok ($slug)"

echo "== submit =="
# a-plus-b: read two numbers, print their sum.
source_code='import sys\na,b=map(int,sys.stdin.read().split())\nprint(a+b)'
response=$(curl -sf -b "$JAR" -H 'Content-Type: application/json' \
  -d "{\"problemSlug\":\"$slug\",\"language\":\"python\",\"source\":\"$source_code\"}" \
  "$API/api/submissions")
id=$(echo "$response" | sed -n 's/.*"submissionId":"\([^"]*\)".*/\1/p')
[ -n "$id" ] || fail "no submissionId in the response: $response"
echo "ok ($id)"

echo "== judging (waiting up to 120 s) =="
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

[ "$status" = "DONE" ] || fail "the submission is stuck in state $status — check the worker logs"
[ "$verdict" = "AC" ] || fail "expected AC, got $verdict"

echo
echo "SMOKE OK — the queue, the worker and Judge0 work end to end"
