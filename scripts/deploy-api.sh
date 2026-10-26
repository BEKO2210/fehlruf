#!/usr/bin/env bash
# Holt main, baut die Fehlruf-API neu und prüft /api/health.
# Bei Fehler: Exit 1 und die letzten 20 Log-Zeilen des Containers.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
URL="${FEHLRUF_HEALTH_URL:-http://127.0.0.1:8787/api/health}"

cd "$REPO"

ZWEIG=$(git branch --show-current)
if [ "$ZWEIG" != main ]; then
  echo "deploy: Repo steht auf '$ZWEIG', erwartet main (git checkout main)" >&2
  exit 1
fi

git fetch -q origin main

# Unversionierte Dateien, die der Pull überschreiben würde: identische Kopien
# (z. B. vorab per scp eingespielte Skripte) räumen wir weg, alles andere stoppt.
mapfile -t IM_WEG < <(comm -12 \
  <(git ls-files --others --exclude-standard | sort) \
  <(git diff --name-only HEAD origin/main | sort))
for DATEI in "${IM_WEG[@]}"; do
  if git show "origin/main:$DATEI" | cmp -s - "$DATEI"; then
    rm -f "$DATEI"
  else
    echo "deploy: unversionierte Datei '$DATEI' weicht von origin/main ab – sichern oder entfernen (git stash -u), dann erneut" >&2
    exit 1
  fi
done

git pull -q --ff-only origin main
cd api
docker compose up -d --build

for _ in $(seq 1 20); do
  if curl -fsS --max-time 2 "$URL" | grep -q '"ok":true'; then
    echo "deploy: ok ($(git rev-parse --short HEAD))"
    exit 0
  fi
  sleep 1
done

echo "deploy: Health-Check gegen $URL fehlgeschlagen" >&2
docker compose logs --tail 20 fehlruf-api >&2 || true
exit 1
