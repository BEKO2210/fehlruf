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

insert into stations (code, name, line) values
  ('L1-04', 'Platz 04', 'Linie 1'),
  ('L1-11', 'Platz 11', 'Linie 1'),
  ('L2-02', 'Platz 02', 'Linie 2'),
  ('L3-07', 'Platz 07', 'Linie 3'),
  ('MONT', 'Montage', 'Montage')
on conflict (code) do nothing;

