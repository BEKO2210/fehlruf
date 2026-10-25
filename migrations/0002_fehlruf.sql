-- Fehlruf: offene Materialrufe aus der Produktion. Zeilen sind absichtlich
-- ohne Nutzerzuordnung (kein Login auf dem Hallenboden).

create table if not exists stations (
  code       text primary key,
  name       text not null,
  line       text not null,
  created_at timestamptz not null default now()
);

create table if not exists calls (
  id           text primary key,
  station_code text not null default '',
  line         text not null,
  part_no      text not null,
  part_name    text not null default '',
  qty          integer not null default 1,
  urgency      text not null default 'normal',
  note         text not null default '',
  status       text not null default 'open',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists calls_status_created_idx on calls (status, created_at desc);

