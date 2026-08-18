#!/usr/bin/env bash
# Judge0/Isolate needs cgroup v1. Docker Desktop on Mac defaults to v2.
set -euo pipefail
SETTINGS="$HOME/Library/Group Containers/group.com.docker/settings-store.json"
if [[ ! -f "$SETTINGS" ]]; then
  echo "$SETTINGS not found — is Docker Desktop installed?"
  exit 1
fi
python3 - "$SETTINGS" <<'PY'
import json, sys
path = sys.argv[1]
data = json.load(open(path))
data["DeprecatedCgroupv1"] = True
json.dump(data, open(path, "w"), indent=2)
open(path, "a").write("\n")
print("Ustawiono DeprecatedCgroupv1=true w", path)
PY
echo
echo "Dalej:"
echo "  1. Quit Docker Desktop (completely)"
echo "  2. Uruchom Docker Desktop ponownie"
echo "  3. cd $(dirname "$0")/.. && docker compose down && docker compose up -d"
echo "  4. npm run smoke:judge0"
