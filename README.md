# Fehlruf

PWA für die Halle: Wer ein Teil braucht, scannt den Barcode am Teil, tippt die Abteilung an (Name freiwillig) und sendet. Das Lager sieht es auf der Tafel und setzt die Prio.

Melden geht ohne Konto. Die Tafel ist mit einer PIN geschützt.

## Ablauf

1. **Melden** (`/`) — Kamera öffnet sich (nach dem ersten Mal automatisch). Barcode vom Teil scannen: EAN, Code 128/39, QR, Data Matrix u. a. Ohne Barcode: Nummer eintippen.
2. **Formular** — Teil steht drin. Abteilung antippen, Name freiwillig, Menge, „Maschine steht still“ (= Sofort). Abteilung und Name merkt sich das Handy, beim nächsten Mal bleibt nur Scannen + Senden.
3. **Tafel** (`/tafel`, PIN) — offene Rufe nach Prio, dann am längsten wartend zuerst. Wartezeit ab 30 Min gelb, ab 2 Std rot. „Was fehlt gerade“ fasst gleiche Teile zusammen. Prio pro Ruf: Sofort / Heute / Normal. Status: Offen → Unterwegs → Erledigt. Pollt alle 4 Sekunden, „Ton an“ piept bei neuen Rufen.
4. **QR-Zettel** (`/plaetze`, PIN, freiwillig) — ein Zettel pro Abteilung/Maschine. Wer ihn scannt, hat die Abteilung schon drin. Alte Zettel (`/ruf/CODE`) funktionieren weiter.

## Sicherheit

- PIN: Beim ersten Öffnen von `/tafel` wird sie festgelegt (6–12 Ziffern, PBKDF2-gehasht in `settings`). **Direkt nach dem Deploy selbst setzen**, sonst kann es jemand anderes tun. Alternativ `FEHLRUF_PIN` als Umgebungsvariable, die hat Vorrang.
- Sitzung: httpOnly-Cookie `fehlruf_tafel`, HMAC-signiert, 30 Tage. PIN ändern loggt alle Geräte aus.
- Raten: max. 8 Fehlversuche pro Adresse und 50 insgesamt in 15 Minuten.
- Öffentlich sind nur `getCallForm` (Abteilungsnamen) und `createCall` (max. 12 Rufe/Minute pro Adresse und Instanz, max. 1000 offene Rufe).
- Aufbewahrung: Namen werden nach 30 Tagen geleert, Erledigtes nach 90 Tagen gelöscht.
- Jede neue Server-Funktion, die Rufe liest oder ändert, ruft zuerst `requireAdmin()`.

## Stack

- TanStack Start / Router, React 19, Vite, Tailwind 4
- Server-Funktionen in [`src/lib/fehlruf.ts`](src/lib/fehlruf.ts)
- Postgres über [`src/lib/db.ts`](src/lib/db.ts): Neon, sobald `DATABASE_URL` gesetzt ist, sonst PGLite im Speicher (lokal, Daten weg nach Neustart)
- QR erzeugen: `qrcode`. Scannen: `BarcodeDetector`, sonst `@zxing/browser`
- UI-Sprache: Deutsch

## Routen

| Pfad | Datei | Was |
|---|---|---|
| `/` | `src/routes/index.tsx` | Teil scannen |
| `/ruf/$code?teil=` | `src/routes/ruf.$code.tsx` | Formular. `neu` = ohne Zettel |
| `/tafel` | `src/routes/tafel.tsx` | Tafel, PIN |
| `/plaetze` | `src/routes/plaetze.tsx` | QR-Zettel, PIN |
| `/scan` | `src/routes/scan.tsx` | leitet auf `/` um |

Shell und Navigation: [`src/components/shell.tsx`](src/components/shell.tsx).

## Daten

Schema: [`migrations/0002_fehlruf.sql`](migrations/0002_fehlruf.sql) und [`0005`](migrations/0005_teile_scannen_pin.sql). Angewendete Dateien nicht mehr ändern, die nächste heißt `migrations/0006_….sql`.

`stations`: `code` (PK, `A–Z`, `0–9`, `-`, 2–16 Zeichen, nicht `NEU`), `name`, `line`.

`calls`: `id` (6 Zeichen), `station_code` (leer erlaubt, kein FK), `line` (= Abteilung), `part_no`, `part_name`, `qty` (1–9999), `urgency` (`sofort` | `heute` | `normal`, = Prio), `note` (max. 140, kein `@`), `requester` (Name, freiwillig, max. 40), `status` (`open` | `underway` | `done`).

`settings`: `pin_hash`, `session_secret`. `pin_failures`: gehashte Adresse + Zeit, nach einem Tag weg.

Server-Funktionen in [`src/lib/fehlruf.ts`](src/lib/fehlruf.ts), PIN-Logik in [`src/lib/admin.server.ts`](src/lib/admin.server.ts):

- Öffentlich: `getCallForm`, `createCall`, `tafelState`, `tafelSetup`, `tafelLogin`
- Mit PIN: `listCalls`, `setCallStatus`, `setCallUrgency`, `listStations`, `saveStation`, `deleteStation`, `tafelChangePin`, `tafelLogout`

## Lokal

```bash
npm install
npm run dev
```

Dev-Server: `http://127.0.0.1:8080` (`npm run dev`, nicht `vite` direkt).

```bash
npm run typecheck
npm run build
```

`npm run build` migriert gegen `DATABASE_URL`, wenn die Variable da ist. Ohne sie überspringt das Script die Migration; PGLite zieht `migrations/*.sql` beim Start selbst.

Eigene Umgebung nur als `.env`, nicht committen. Reicht `DATABASE_URL` für echtes Postgres.

## Weiterbauen

- Neue Migrationen nur als neue Datei ab `0006`.
- Kein `authMiddleware` und kein `user_id`. Die Tafel hängt an der PIN, Melden bleibt offen.
- Name ist freiwillig und wird nach 30 Tagen geleert. Keine Auswertungen pro Person bauen (Betriebsrat, DSGVO).
- Router bleibt `export function getRouter()` in [`src/router.tsx`](src/router.tsx). `server/middleware/grok-pwa.ts` und `public/__grok/` nicht ausbauen, sonst geht die Install-Seite der PWA kaputt.
- `.grok/app-env.json` hält `deploy.database: true`, damit beim Veröffentlichen eine Datenbank da ist. `VITE_AUTH_ENABLED` bleibt `false`.
