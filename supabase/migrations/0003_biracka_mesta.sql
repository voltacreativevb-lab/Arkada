-- ============================================================================
-- MAESTROVOLTA — Migration 0003: Izborni rezultati (biračka mesta)
-- Jednokratan dodatak: praćenje rezultata sa 37 biračkih mesta (SNS i
-- Studentska lista) za javnu stranicu za unos i TV prikaz uživo. Nevezano
-- za ostatak proizvoda — sopstvena tabela, bez RLS policy-ja (deny-by-default,
-- isti pattern kao i ostale tabele; backend pristupa preko service role).
-- ============================================================================

create table biracka_mesta (
  broj        smallint primary key check (broj between 1 and 37),
  upisani     integer not null default 0 check (upisani >= 0),
  glasalo     integer not null default 0 check (glasalo >= 0),
  sns         integer not null default 0 check (sns >= 0),
  student     integer not null default 0 check (student >= 0),
  nevazeci    integer not null default 0 check (nevazeci >= 0),
  unet        boolean not null default false,
  updated_at  timestamptz not null default now()
);

insert into biracka_mesta (broj)
select generate_series(1, 37);

alter table biracka_mesta enable row level security;
