-- ============================================================================
-- MAESTROVOLTA — Migration 0001: Foundation
-- Prodavnice (stores), radnici (PIN-login workers), proizvodi/modeli (catalog
-- + personalization templates), porudzbine (orders) + istorija_statusa +
-- obavestenja (customer notification queue).
--
-- No Supabase Auth / RLS-gated client access exists for customers or workers
-- in this app — the backend's service_role client is the only writer/reader,
-- authorization is enforced in Express. RLS is still enabled with NO
-- permissive policies below as pure defense-in-depth (deny-by-default) in
-- case the anon key is ever used somewhere it shouldn't be.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- TABLE: prodavnice
-- ----------------------------------------------------------------------------
create table prodavnice (
  id                    uuid primary key default gen_random_uuid(),
  naziv                 text not null,
  slug                  text not null unique,         -- QR-landing URL: /p/<slug>
  grad                  text not null,
  adresa                text,
  radno_vreme           text,
  udeo_prodavnice       numeric(4,3) not null default 0.40,  -- store's cut of retail price
  aktivna               boolean not null default true,
  -- PIN-login lockout is tracked per STORE (shared tablet), not per worker —
  -- the PIN alone doesn't identify a worker until it matches one.
  failed_pin_attempts   int not null default 0,
  locked_until          timestamptz,
  created_at            timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABLE: radnici
-- ----------------------------------------------------------------------------
create table radnici (
  id              uuid primary key default gen_random_uuid(),
  prodavnica_id   uuid not null references prodavnice(id) on delete cascade,
  ime             text not null,
  pin_hash        text not null,                       -- bcrypt
  aktivan         boolean not null default true,
  token_version   int not null default 0,               -- bump to invalidate all issued JWTs for this worker
  last_login_at   timestamptz,
  created_at      timestamptz not null default now()
);

create index radnici_prodavnica_id_idx on radnici(prodavnica_id);

-- ----------------------------------------------------------------------------
-- TABLE: proizvodi
-- ----------------------------------------------------------------------------
create table proizvodi (
  id              uuid primary key default gen_random_uuid(),
  naziv           text not null,
  slug            text not null unique,
  opis            text,
  osnovna_cena    numeric(10,2) not null,
  slika_glavna    text,                                 -- storage path in slike/
  aktivan         boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABLE: modeli
-- sablon_config/polja are derived automatically by parsing the uploaded SVG
-- template (shared/sablon-core parseSablonTemplate) — never hand-entered.
-- ----------------------------------------------------------------------------
create table modeli (
  id                uuid primary key default gen_random_uuid(),
  proizvod_id       uuid not null references proizvodi(id) on delete cascade,
  naziv             text not null,
  kod               text not null,                      -- "A" / "B" / "C", unique per proizvod
  cena              numeric(10,2),                       -- null = fall back to proizvodi.osnovna_cena
  sablon_svg_path   text not null,                        -- storage path in sabloni/
  sablon_hash       text not null,                         -- sha256 of the template at last parse
  sablon_config     jsonb not null,                        -- { viewBoxW, viewBoxH, mmScale, zone:{x,y,w,h} }
  polja             jsonb not null,                        -- [{ key,label,placeholder,default_x,default_y,max_len,min_mm,max_mm,default_mm,required }]
  slika_pregled     text,
  aktivan           boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (proizvod_id, kod)
);

create index modeli_proizvod_id_idx on modeli(proizvod_id);

-- ----------------------------------------------------------------------------
-- TABLE: porudzbine
-- status is text+check, not a native enum — easier to extend without DDL
-- ceremony as the workflow evolves.
-- ----------------------------------------------------------------------------
create table porudzbine (
  id                      uuid primary key default gen_random_uuid(),
  kod                     text not null unique,            -- short code shown at the register, e.g. "K7F-42"
  prodavnica_id           uuid not null references prodavnice(id),
  model_id                uuid not null references modeli(id),
  polja                   jsonb not null,                   -- raw customer input per field key, pre-transliteration
  pismo                   text not null check (pismo in ('lat', 'cyr')),
  font                    text not null,
  pozicije                jsonb not null,                   -- server-computed {key: {x,y,sizePx}}
  cena                    numeric(10,2) not null,            -- server-computed price snapshot
  telefon_kupca           text,
  kanal_obavestavanja     text check (kanal_obavestavanja in ('whatsapp', 'viber')),
  status                  text not null default 'kreirana' check (status in (
                            'kreirana', 'placena', 'u_proizvodnji', 'poslata_u_prodavnicu',
                            'spremna_za_preuzimanje', 'preuzeta', 'otkazana', 'istekla'
                          )),
  istice_u                timestamptz,                       -- created_at + 48h while status = 'kreirana'
  svg_proizvodnja_path    text,                               -- storage path in proizvodnja/
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index porudzbine_prodavnica_id_idx on porudzbine(prodavnica_id);
create index porudzbine_status_idx on porudzbine(status);
create index porudzbine_istice_u_idx on porudzbine(istice_u) where status = 'kreirana';

-- ----------------------------------------------------------------------------
-- TABLE: istorija_statusa — append-only audit trail of every status change.
-- ----------------------------------------------------------------------------
create table istorija_statusa (
  id              uuid primary key default gen_random_uuid(),
  porudzbina_id   uuid not null references porudzbine(id) on delete cascade,
  status          text not null,
  actor_type      text not null check (actor_type in ('kupac', 'radnik', 'admin', 'sistem')),
  actor_id        uuid,
  napomena        text,
  created_at      timestamptz not null default now()
);

create index istorija_statusa_porudzbina_id_idx on istorija_statusa(porudzbina_id);

-- ----------------------------------------------------------------------------
-- TABLE: obavestenja — the "Za obavestiti" WhatsApp/Viber messaging queue.
-- One row per (order, message-type); inserted by transitionStatus() at the
-- two points the README specifies.
-- ----------------------------------------------------------------------------
create table obavestenja (
  id              uuid primary key default gen_random_uuid(),
  porudzbina_id   uuid not null references porudzbine(id) on delete cascade,
  tip             text not null check (tip in ('u_proizvodnji', 'stiglo_u_prodavnicu')),
  poslato         boolean not null default false,
  poslato_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (porudzbina_id, tip)
);

-- ----------------------------------------------------------------------------
-- updated_at bookkeeping
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger modeli_set_updated_at before update on modeli
  for each row execute function set_updated_at();
create trigger porudzbine_set_updated_at before update on porudzbine
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — enabled everywhere, zero permissive policies (deny-by-default).
-- The backend's service_role client bypasses RLS entirely; this is pure
-- defense-in-depth, not the authorization mechanism.
-- ----------------------------------------------------------------------------
alter table prodavnice enable row level security;
alter table radnici enable row level security;
alter table proizvodi enable row level security;
alter table modeli enable row level security;
alter table porudzbine enable row level security;
alter table istorija_statusa enable row level security;
alter table obavestenja enable row level security;
