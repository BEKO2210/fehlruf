# Fehlruf

Wer ein Teil braucht, scannt den Barcode am Teil, tippt die Abteilung / Linie an (Name freiwillig) und sendet. Das Lager sieht es auf der Tafel und setzt die Prio.

- **Seite:** statisch auf GitHub Pages (`https://beko2210.github.io/fehlruf/`)
- **Daten:** kleine API auf dem Heimserver (`api/`), Docker, erreichbar über Cloudflare Tunnel

Melden geht ohne Konto. Die Tafel ist mit einer PIN geschützt.

## Ablauf

1. **Melden** (`#/`): Die Kamera öffnet sich, nach dem ersten Mal automatisch. Sie liest EAN, Code 128/39, QR, Data Matrix u. a. Ohne Barcode: Nummer eintippen.
2. **Formular** (`#/ruf/neu?teil=…`): Das Teil steht schon drin. Abteilung / Linie antippen, Name freiwillig, Menge, „Maschine steht still“ (= Sofort). Abteilung / Linie und Name merkt sich das Handy.
3. **Tafel** (`#/tafel`, PIN):
   - Sortierung: erst Prio, dann wer am längsten wartet.
   - Wartezeit ab 30 Min gelb, ab 2 Std rot. „Was fehlt gerade“ fasst gleiche Teile zusammen.
   - Prio Sofort / Heute / Normal, Status Offen → Unterwegs → Erledigt. Holt alle 4 Sekunden neu, auf Wunsch mit Ton.
4. **QR-Zettel** (`#/plaetze`, PIN, freiwillig): ein Zettel pro Abteilung / Linie oder Maschine. Wer ihn scannt, hat die Abteilung / Linie schon drin.

## Einrichten

### 1. API auf dem Heimserver

```bash
git clone https://github.com/BEKO2210/fehlruf.git
cd fehlruf/api
docker compose up -d --build
curl http://127.0.0.1:8787/api/health   # {"ok":true}
```

Die API hört nur auf `127.0.0.1:8787`. Die Daten liegen im Docker-Volume `fehlruf-data` (SQLite).

### 2. Cloudflare Tunnel

Im Tunnel einen Public Hostname anlegen, z. B. `fehlruf-api.deinedomain.de` → `http://localhost:8787`.

Die API nimmt die echte Adresse aus `CF-Connecting-IP`. Das ist nur sicher, weil sie ausschließlich über den Tunnel erreichbar ist: Port nicht freigeben. Sonst `TRUST_CLOUDFLARE=0` setzen.

### 3. GitHub Pages

1. Repo → Settings → Pages → Source: **GitHub Actions**.
2. Repo → Settings → Secrets and variables → Actions → **Variables**: `FEHLRUF_API_URL` = `https://fehlruf-api.deinedomain.de`.
3. Auf `main` pushen. Der Workflow `GitHub Pages` baut und veröffentlicht.

Ohne `FEHLRUF_API_URL` bricht der Deploy mit einer klaren Meldung ab.

### 4. PIN

Gleich nach dem ersten Deploy `…/fehlruf/#/tafel` öffnen und die PIN festlegen (6–12 Ziffern). Wer die Tafel zuerst öffnet, legt sie fest. Alternativ `FEHLRUF_PIN` in `api/compose.yml` setzen, die hat Vorrang.

## Sicherheit

- PIN mit PBKDF2 gehasht. Das Token ist HMAC-signiert, gilt 30 Tage und liegt im `localStorage` des Geräts. PIN ändern meldet alle anderen Geräte ab.
- Gesperrt wird nach 8 PIN-Fehlversuchen pro Adresse oder 50 insgesamt in 15 Minuten.
- CORS: Nur Origins aus `ALLOWED_ORIGINS` bekommen eine Antwort, alle anderen ein 403.
- Öffentlich sind `GET /api/health`, `GET /api/form` (Namen der Abteilungen / Linien), `POST /api/calls` (30/Min pro Adresse, max. 1000 offene), `POST /api/mine`, `POST /api/calls/:id/received`, `GET /api/state`, `POST /api/setup` und `POST /api/login`.
- Geräteschlüssel werden nur als HMAC mit eigenem, dauerhaftem Geheimnis gespeichert. PIN-Wechsel lässt eigene Rufe erreichbar.
- Container: `read_only`, keine Capabilities, kein Root. Die API hat keine npm-Abhängigkeiten.
- Aufbewahrung: Namen werden nach 30 Tagen geleert, Erledigtes nach 90 Tagen gelöscht.

**Ausfall:** Läuft der Heimserver nicht, kann niemand melden. Die Seite zeigt dann „Keine Verbindung zum Server“.

**Backup:** siehe [Betrieb](#betrieb) (`scripts/backup.sh`).

## API

| Methode | Pfad | PIN |
|---|---|---|
| GET | `/api/health` | – |
| GET | `/api/form?code=` | – |
| POST | `/api/calls` (`orderNo`, `device` freiwillig) | – |
| POST | `/api/mine` (`device`) | – |
| POST | `/api/calls/:id/received` (`device`) | – |
| GET | `/api/state` | – |
| POST | `/api/setup`, `/api/login` | – |
| POST | `/api/pin` | ja |
| GET | `/api/calls` | ja |
| PATCH | `/api/calls/:id` (`status`, `urgency`, `reply`) | ja |
| GET | `/api/stats?days=1\|7\|30` | ja |
| GET/POST | `/api/stations` | ja |
| DELETE | `/api/stations/:code` | ja |

Daten: `calls.line` = Abteilung / Linie, `urgency` = Prio, `requester` = Name (freiwillig), `orderNo` = Auftrag. `underway` bedeutet „Gesendet“; erst `received` oder Abschluss durch Lager setzt „Erhalten“. `GET /api/calls` markiert offene Rufe als gesehen. Statistik verwendet Berliner Tagesgrenzen und wertet keine Personen aus.

## Betrieb

Beide Skripte laufen auf dem Heimserver im geklonten Repo (`~/fehlruf`), ohne sudo.

### Backup

```bash
~/fehlruf/scripts/backup.sh
# backup: /home/<user>/fehlruf-backup/fehlruf-20261026-0230.db (48K)
```

Zieht per `VACUUM INTO` eine konsistente Kopie aus dem laufenden Container, legt sie unter `~/fehlruf-backup/fehlruf-<YYYYMMDD-HHMM>.db` ab und löscht eigene Sicherungen, die älter als 30 Tage sind.

Täglich um 2:30 Uhr per Cron. Auf belkis-home ist dieser Eintrag bereits vorhanden (`crontab -l`), sonst per `crontab -e`:

```
30 2 * * * $HOME/fehlruf/scripts/backup.sh >> $HOME/fehlruf-backup/backup.log 2>&1
```

### Wiederherstellung

```bash
cd ~/fehlruf/api
docker compose stop fehlruf-api
VOL=$(docker volume ls -q | grep fehlruf-data)
docker run --rm -v "$VOL:/data" -v ~/fehlruf-backup:/b alpine \
  sh -c 'rm -f /data/fehlruf.db /data/fehlruf.db-wal /data/fehlruf.db-shm && cp /b/fehlruf-20261026-0230.db /data/fehlruf.db && chown 1000:1000 /data/fehlruf.db'
docker compose start fehlruf-api
curl http://127.0.0.1:8787/api/health
```

Vorher eine frische Sicherung ziehen, falls der Stand doch noch gebraucht wird.

### Deploy

```bash
~/fehlruf/scripts/deploy-api.sh
# deploy: ok (e9e4af3)
```

Prüft, dass `main` ausgecheckt ist, macht `git pull --ff-only origin main`, `docker compose up -d --build` in `api/` und wartet auf `/api/health`. Unversionierte Dateien, die der Pull überschreiben würde (z. B. vorab per scp kopierte Skripte), räumt es weg, wenn sie mit `origin/main` identisch sind; sonst bricht es mit Hinweis ab (`git stash -u`, dann erneut). Schlägt der Health-Check fehl, endet das Skript mit Exit 1 und zeigt die letzten 20 Log-Zeilen. Die Seite selbst deployt GitHub Actions beim Push.

## Lokal

```bash
npm install
npm run api    # API auf :8787, Datenbank in api/data/
npm run dev    # Seite auf :5173
npm test       # API-Tests
npm run build  # tsc + vite build nach dist/
```

`VITE_API_URL` zeigt beim Bauen auf die API, Standard ist `http://localhost:8787`.

## Weiterbauen

- Jede neue Route in `api/server.mjs` ist automatisch PIN-pflichtig, außer sie steht in `PUBLIC`.
- Routing über Hash (`#/tafel`), weil GitHub Pages keine Umleitung auf `index.html` kennt. QR-Zettel enthalten `…/#/ruf/CODE`. Alte Zettel mit `/ruf/CODE` erkennt der Scanner weiterhin.
- Keine Auswertungen pro Person bauen (Betriebsrat, DSGVO).
