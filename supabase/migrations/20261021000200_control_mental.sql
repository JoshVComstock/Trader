-- Control mental: ansiedad por operación, preferencias, revisión semanal y observaciones.

-- Ansiedad / ganas de recuperar al entrar, de 1 (nada) a 5 (mucha).
alter table public.trades
  add column anxiety smallint check (anxiety is null or anxiety between 1 and 5);

-- Preferencias por usuario: qué funciones de control mental están activas y la frase de pausa.
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  psych jsonb not null default '{}'::jsonb,
  pause_phrase text check (pause_phrase is null or char_length(pause_phrase) <= 280),
  updated_at timestamptz not null default now()
);

-- Revisión de cada domingo. week_start es el lunes de la semana revisada.
create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  answer text not null check (char_length(answer) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- Lo que notas al hacer backtesting (zonas que reaccionan, patrones que se repiten).
create type public.observation_kind as enum ('zona', 'patron', 'nota');

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  instrument text references public.instruments (code),
  kind public.observation_kind not null default 'zona',
  level numeric(14, 4),
  timeframe text check (timeframe is null or char_length(timeframe) <= 10),
  note text not null check (char_length(note) between 1 and 1000),
  times_seen integer not null default 1 check (times_seen >= 1),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index observations_user_idx on public.observations (user_id, instrument, last_seen_at desc);

alter table public.user_settings enable row level security;
alter table public.weekly_reviews enable row level security;
alter table public.observations enable row level security;

create policy user_settings_own on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy weekly_reviews_own on public.weekly_reviews
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy observations_own on public.observations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (account_id is null or exists (
      select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())
    ))
  );
