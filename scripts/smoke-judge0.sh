#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${JUDGE0_URL:-http://127.0.0.1:2358}"

echo "Waiting for Judge0 at ${BASE_URL}..."
for i in $(seq 1 60); do
  if curl -sf "${BASE_URL}/about" >/dev/null; then
    echo "Judge0 is up."
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo "Judge0 did not become ready."
    exit 1
  fi
  sleep 2
done

echo "Python hello..."
curl -s "${BASE_URL}/submissions?base64_encoded=false&wait=true" \
  -H "Content-Type: application/json" \
  -d '{"source_code":"print(42)","language_id":71,"stdin":""}' | tee /tmp/sfera-py.json
echo

echo "C++ A+B..."
curl -s "${BASE_URL}/submissions?base64_encoded=false&wait=true" \
  -H "Content-Type: application/json" \
  -d '{"source_code":"#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<std::endl;return 0;}","language_id":54,"stdin":"2 3\n"}' | tee /tmp/sfera-cpp.json
echo

python3 - <<'PY'
import json
py = json.load(open("/tmp/sfera-py.json"))
cpp = json.load(open("/tmp/sfera-cpp.json"))
assert py.get("stdout", "").strip() == "42", py
assert cpp.get("stdout", "").strip() == "5", cpp
print("Smoke OK:", py["status"]["description"], "+", cpp["status"]["description"])
PY
