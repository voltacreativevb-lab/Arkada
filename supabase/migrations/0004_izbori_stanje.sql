-- ============================================================================
-- MAESTROVOLTA — Migration 0004: Izborni TV prikaz — deljeno stanje
-- Singleton red za ono što operater objavljuje na TV: slobodan tekst
-- (poruka) i prekidač za animaciju "SRBIJA POBEĐUJE".
-- ============================================================================

create table izbori_stanje (
  id              smallint primary key default 1 check (id = 1),
  poruka          text not null default '',
  pobeda_prikaz   boolean not null default false,
  updated_at      timestamptz not null default now()
);

insert into izbori_stanje (id) values (1);

alter table izbori_stanje enable row level security;
