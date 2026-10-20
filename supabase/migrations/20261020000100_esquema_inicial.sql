-- Racha v0 — esquema inicial
-- Todo se guarda en UTC. Las fechas de sesión (`date`) son días en America/La_Paz.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.account_kind as enum ('real', 'demo', 'backtest');
create type public.instrument_family as enum ('boom', 'crash');
create type public.trade_direction as enum ('buy', 'sell');
create type public.trade_outcome as enum ('win', 'loss', 'tie');
create type public.mood as enum ('tranquilo', 'acelerado', 'cansado');
create type public.session_status as enum ('open', 'closed', 'blocked');
create type public.rule_action as enum ('warn', 'block');
create type public.rule_type as enum (
  'max_trades',
  'max_losses',
  'max_session_minutes',
  'max_risk_pct',
  'allowed_hours',
  'no_size_increase_after_loss',
  'min_gap_seconds',
  'max_psych_errors'
);

-- ---------------------------------------------------------------------------
-- Catálogo global de instrumentos
-- ---------------------------------------------------------------------------
create table public.instruments (
  code text primary key,
  family public.instrument_family not null,
  spike_every integer not null check (spike_every > 0),
  favored_direction public.trade_direction not null
);

insert into public.instruments (code, family, spike_every, favored_direction) values
  ('BOOM300',   'boom',  300,  'buy'),
  ('BOOM500',   'boom',  500,  'buy'),
  ('BOOM600',   'boom',  600,  'buy'),
  ('BOOM900',   'boom',  900,  'buy'),
  ('BOOM1000',  'boom',  1000, 'buy'),
  ('CRASH300',  'crash', 300,  'sell'),
  ('CRASH500',  'crash', 500,  'sell'),
  ('CRASH600',  'crash', 600,  'sell'),
  ('CRASH900',  'crash', 900,  'sell'),
  ('CRASH1000', 'crash', 1000, 'sell');

-- ---------------------------------------------------------------------------
-- Cuentas de trading
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  broker text not null default 'deriv',
  label text not null check (char_length(label) between 1 and 60),
  kind public.account_kind not null default 'real',
  currency text not null default 'USD',
  start_balance numeric(14, 2) not null check (start_balance >= 0),
  created_at timestamptz not null default now()
);
create index accounts_user_idx on public.accounts (user_id);

-- ---------------------------------------------------------------------------
-- Estrategias
-- ---------------------------------------------------------------------------
create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  context_tf text not null default '1H',
  entry_tf text not null default '1M',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index strategies_user_idx on public.strategies (user_id);

-- ---------------------------------------------------------------------------
-- Reglas
-- ---------------------------------------------------------------------------
create table public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type public.rule_type not null,
  params jsonb not null default '{}'::jsonb,
  action public.rule_action not null default 'warn',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, type)
);

-- ---------------------------------------------------------------------------
-- Sesiones: una por día y cuenta
-- ---------------------------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  date date not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  mood_before public.mood,
  read_rules boolean not null default false,
  goal_r numeric(6, 2),
  followed_plan boolean,
  journal text,
  status public.session_status not null default 'open',
  created_at timestamptz not null default now(),
  unique (account_id, date)
);
create index sessions_user_idx on public.sessions (user_id, account_id, date desc);

-- ---------------------------------------------------------------------------
-- Operaciones
-- ---------------------------------------------------------------------------
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  strategy_id uuid references public.strategies (id) on delete set null,
  instrument text not null references public.instruments (code),
  direction public.trade_direction not null,
  with_spike boolean not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  stake numeric(14, 2) not null check (stake > 0),
  tp numeric(14, 2) check (tp is null or tp >= 0),
  pnl numeric(14, 2) not null,
  r_multiple numeric(10, 4) not null,
  outcome public.trade_outcome not null,
  mood public.mood,
  moved_sl boolean not null default false,
  in_plan boolean not null default true,
  checklist jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  check (closed_at is null or closed_at >= opened_at)
);
create index trades_account_opened_idx on public.trades (account_id, opened_at desc);
create index trades_session_idx on public.trades (session_id, opened_at);
create index trades_user_idx on public.trades (user_id);

-- ---------------------------------------------------------------------------
-- Violaciones de reglas
-- ---------------------------------------------------------------------------
create table public.rule_violations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trade_id uuid references public.trades (id) on delete set null,
  session_id uuid not null references public.sessions (id) on delete cascade,
  rule_type public.rule_type not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index rule_violations_trade_idx on public.rule_violations (trade_id);
create index rule_violations_session_idx on public.rule_violations (session_id);

-- ---------------------------------------------------------------------------
-- Capturas (los archivos viven en Cloudinary, tipo `private`)
-- path = public_id en Cloudinary: racha/{user_id}/{trade_id}/{uuid}
-- ---------------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  path text not null unique,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  bytes integer not null check (bytes > 0),
  created_at timestamptz not null default now(),
  -- El primer segmento tras el prefijo tiene que ser el dueño: nadie guarda rutas ajenas.
  check (split_part(path, '/', 2) = user_id::text)
);
create index attachments_trade_idx on public.attachments (trade_id);

-- ---------------------------------------------------------------------------
-- Métricas diarias (las mantienen los triggers, nunca se escriben a mano)
-- ---------------------------------------------------------------------------
create table public.metrics_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  date date not null,
  trades integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  pnl numeric(14, 2) not null default 0,
  gross_profit numeric(14, 2) not null default 0,
  gross_loss numeric(14, 2) not null default 0,
  r_sum numeric(12, 4) not null default 0,
  with_spike_trades integer not null default 0,
  compliance_pct numeric(5, 2) not null default 100,
  max_drawdown numeric(14, 2) not null default 0,
  primary key (account_id, date)
);
create index metrics_daily_user_idx on public.metrics_daily (user_id, account_id, date);
