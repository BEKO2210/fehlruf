# Fehlruf

PWA für die Halle: Ein fehlendes Teil wird per Handy-QR gerufen und erscheint auf der Tafel. Ohne Linie geht der Ruf nicht raus.

Kein Login. Jeder mit dem Link kann rufen und die Tafel sehen. Deshalb keine Namen, keine E-Mails, kein „alles löschen“.

## Ablauf

1. **Plätze** — Arbeitsplatz anlegen (Code, Name, Linie) und den Zettel drucken.
2. **Scannen** — QR mit der Handy-Kamera oder den Code eintippen (`L2-02`). Ohne Code geht `/ruf/neu`.
3. **Ruf** — Linie ist Pflicht (tippen oder selbst schreiben), dazu Teilenummer, Menge, Dringlichkeit, optional Auftrag/Hinweis.
4. **Tafel** — offene Rufe, Sofort zuerst. Status: Offen → Unterwegs → Erledigt. Pollt alle 4 Sekunden. „Ton an“ piept bei einem neuen offenen Ruf.

Der QR-Code enthält die volle URL `{origin}/ruf/{CODE}`. Die normale Handy-Kamera öffnet das Formular, die App muss dafür nicht schon offen sein. Codes neu drucken, wenn sich die Adresse der App ändert.

Es sind keine Beispiel-Linien und keine Demo-Rufe mehr im System. Plätze legt ihr selbst an.

## Stack

- TanStack Start / Router, React 19, Vite, Tailwind 4
- Server-Funktionen in [`src/lib/fehlruf.ts`](src/lib/fehlruf.ts)
- Postgres über [`src/lib/db.ts`](src/lib/db.ts): Neon, sobald `DATABASE_URL` gesetzt ist, sonst PGLite im Speicher (lokal, Daten weg nach Neustart)
- QR erzeugen: `qrcode`. Scannen: `BarcodeDetector`, sonst `@zxing/browser`
- UI-Sprache: Deutsch

## Routen

| Pfad | Datei | Was |
|---|---|---|
| `/` | `src/routes/index.tsx` | Tafel |
| `/scan` | `src/routes/scan.tsx` | Kamera und Code-Eingabe |
| `/ruf/$code` | `src/routes/ruf.$code.tsx` | Formular. `neu` = ohne Platz |
| `/plaetze` | `src/routes/plaetze.tsx` | Plätze anlegen, QR drucken |

Shell und Navigation: [`src/components/shell.tsx`](src/components/shell.tsx).

## Daten

Schema: [`migrations/0002_fehlruf.sql`](migrations/0002_fehlruf.sql). Angewendete Dateien nicht mehr ändern, die nächste heißt `migrations/0005_….sql`.

`stations`: `code` (PK, `A–Z`, `0–9`, `-`, 2–16 Zeichen, nicht `NEU`), `name`, `line`.

`calls`: `id` (6 Zeichen), `station_code` (leer erlaubt, kein FK), `line`, `part_no`, `part_name`, `qty` (1–9999), `urgency` (`sofort` | `heute` | `normal`), `note` (max. 140, kein `@`), `status` (`open` | `underway` | `done`).

Server-Funktionen, alle ohne Auth:

- `listCalls`, `listStations`
- `createCall` — Linie und Teilenummer Pflicht
- `setCallStatus` — ein Ruf, kein Sammel-Löschen
- `saveStation` — legt an oder aktualisiert Name und Linie am gleichen Code

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

- Neue Migrationen nur als neue Datei ab `0005`. `0002` bis `0004` sind gelaufen (`0003`/`0004` haben die Demo-Daten entfernt).
- Kein `authMiddleware` und kein `user_id`, solange die Halle ohne Konto arbeitet. Login erst, wenn Rufe jemandem gehören sollen oder etwas gelöscht werden muss.
- Freitext bleibt sachlich (Teil, Auftrag). Keine Personen.
- Router bleibt `export function getRouter()` in [`src/router.tsx`](src/router.tsx). `server/middleware/grok-pwa.ts` und `public/__grok/` nicht ausbauen, sonst geht die Install-Seite der PWA kaputt.
- `.grok/app-env.json` hält `deploy.database: true`, damit beim Veröffentlichen eine Datenbank da ist. `VITE_AUTH_ENABLED` bleibt `false`.
