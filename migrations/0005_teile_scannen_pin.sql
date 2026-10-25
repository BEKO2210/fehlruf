-- Teil scannen statt Platz: optionaler Name pro Ruf, PIN für die Tafel.
-- Namen werden nach 30 Tagen geleert, erledigte Rufe nach 90 Tagen gelöscht
-- (läuft beim Laden der Tafel, siehe src/lib/fehlruf.ts).

alter table calls add column if not exists requester text not null default '';

-- Schlüssel/Wert für die Tafel-PIN (gehasht) und das Sitzungs-Geheimnis.
create table if not exists settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Fehlversuche an der PIN. Nur ein Hash der Adresse, nach einem Tag weg.
create table if not exists pin_failures (
  id      bigserial primary key,
  ip_hash text not null,
  at      timestamptz not null default now()
);

create index if not exists pin_failures_at_idx on pin_failures (at);
