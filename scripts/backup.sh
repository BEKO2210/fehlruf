#!/usr/bin/env bash
# Sichert die SQLite-Datenbank der Fehlruf-API konsistent (VACUUM INTO) aus dem
# laufenden Container nach ~/fehlruf-backup/fehlruf-<YYYYMMDD-HHMM>.db.
# Sicherungen älter als 30 Tage werden gelöscht. Keine Cron-Einträge, kein sudo.
set -euo pipefail

CONTAINER="${FEHLRUF_CONTAINER:-fehlruf-api}"
ZIEL="${FEHLRUF_BACKUP_DIR:-$HOME/fehlruf-backup}"
TMP=/data/backup-tmp.db
STAMP=$(date +%Y%m%d-%H%M)
DATEI="fehlruf-$STAMP.db"

VOLUME=$(docker volume ls -q | grep -m1 'fehlruf-data' || true)
if [ -z "$VOLUME" ]; then
  echo "backup: Volume fehlruf-data nicht gefunden" >&2
  exit 1
fi

mkdir -p "$ZIEL"

# Konsistente Kopie im Container: /app ist read_only, /data nicht.
JS=$(cat <<'NODE'
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const tmp = process.argv[1];
try { fs.unlinkSync(tmp); } catch {}
const db = new DatabaseSync(process.env.FEHLRUF_DB);
db.exec("vacuum into '" + tmp + "'");
db.close();
NODE
)
docker exec "$CONTAINER" node -e "$JS" "$TMP"

# Aus dem Volume in den Zielordner kopieren, dann Tmp-Datei entfernen.
docker run --rm -v "$VOLUME:/data" -v "$ZIEL:/b" alpine \
  sh -c "cp /data/backup-tmp.db /b/$DATEI && rm -f /data/backup-tmp.db"

# Alte Sicherungen (eigenes Namensschema) nach 30 Tagen löschen.
find "$ZIEL" -maxdepth 1 -name 'fehlruf-[0-9]*-[0-9]*.db' -mtime +30 -delete

echo "backup: $ZIEL/$DATEI ($(du -h "$ZIEL/$DATEI" | cut -f1))"
