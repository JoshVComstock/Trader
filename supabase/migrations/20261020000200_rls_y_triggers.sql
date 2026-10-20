-- Racha v0 — RLS, bloqueo real de sesión y métricas diarias

-- ---------------------------------------------------------------------------
-- RLS en todas las tablas
-- ---------------------------------------------------------------------------
alter table public.instruments enable row level security;
alter table public.accounts enable row level security;
alter table public.strategies enable row level security;
alter table public.rules enable row level security;
alter table public.sessions enable row level security;
alter table public.trades enable row level security;
alter table public.rule_violations enable row level security;
alter table public.attachments enable row level security;
alter table public.metrics_daily enable row level security;

-- Catálogo: lectura para cualquier usuario autenticado, nadie escribe.
create policy instruments_read on public.instruments
  for select to authenticated using (true);

-- Tablas propias del usuario: lectura y escritura solo de lo suyo.
create policy accounts_own on public.accounts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy strategies_own on public.strategies
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy rules_own on public.rules
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy sessions_own on public.sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = (select auth.uid())
    )
  );

create policy trades_own on public.trades
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Las violaciones no se editan ni se borran: quedan como registro.
create policy rule_violations_read on public.rule_violations
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy rule_violations_insert on public.rule_violations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

create policy attachments_read on public.attachments
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.trades t
      where t.id = trade_id and t.user_id = (select auth.uid())
    )
  );

create policy attachments_delete on public.attachments
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Las métricas solo se leen; las escriben los triggers.
create policy metrics_daily_read on public.metrics_daily
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Bloqueo real: una sesión bloqueada o cerrada no acepta operaciones nuevas,
-- venga la petición del Server Action o directo de la API.
-- ---------------------------------------------------------------------------
create or replace function public.trades_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s record;
begin
  if tg_op = 'UPDATE' then
    if new.session_id <> old.session_id
      or new.account_id <> old.account_id
      or new.user_id <> old.user_id then
      raise exception 'No se puede mover una operación a otra sesión o cuenta'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  select id, user_id, account_id, status
    into s
    from public.sessions
    where id = new.session_id
    for update;

  if not found or s.user_id <> new.user_id or s.account_id <> new.account_id then
    raise exception 'La sesión no corresponde a esta cuenta'
      using errcode = 'P0001';
  end if;

  if s.status = 'blocked' then
    raise exception 'SESSION_BLOCKED' using errcode = 'P0001',
      hint = 'La sesión de hoy está bloqueada por tus reglas.';
  end if;

  if s.status = 'closed' then
    raise exception 'SESSION_CLOSED' using errcode = 'P0001',
      hint = 'Cerraste la sesión de hoy.';
  end if;

  return new;
end;
$$;

create trigger trades_guard
  before insert or update on public.trades
  for each row execute function public.trades_guard();

create or replace function public.sessions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'blocked' and new.status <> 'blocked' then
    raise exception 'Una sesión bloqueada no se puede reabrir'
      using errcode = 'P0001';
  end if;
  if new.account_id <> old.account_id
    or new.date <> old.date
    or new.user_id <> old.user_id then
    raise exception 'No se puede cambiar la cuenta o la fecha de una sesión'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger sessions_guard
  before update on public.sessions
  for each row execute function public.sessions_guard();

-- ---------------------------------------------------------------------------
-- Métricas diarias
-- ---------------------------------------------------------------------------
create or replace function public.recompute_metrics_daily(p_account uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_trades integer;
begin
  if p_account is null or p_date is null then
    return;
  end if;

  select user_id into v_user from public.accounts where id = p_account;
  if v_user is null then
    return;
  end if;

  select count(*) into v_trades
    from public.trades t
    join public.sessions s on s.id = t.session_id
    where s.account_id = p_account and s.date = p_date;

  if v_trades = 0 then
    delete from public.metrics_daily where account_id = p_account and date = p_date;
    return;
  end if;

  insert into public.metrics_daily as m (
    user_id, account_id, date, trades, wins, losses, pnl, gross_profit,
    gross_loss, r_sum, with_spike_trades, compliance_pct, max_drawdown
  )
  select
    v_user,
    p_account,
    p_date,
    count(*),
    count(*) filter (where d.outcome = 'win'),
    count(*) filter (where d.outcome = 'loss'),
    coalesce(sum(d.pnl), 0),
    coalesce(sum(d.pnl) filter (where d.pnl > 0), 0),
    coalesce(-sum(d.pnl) filter (where d.pnl < 0), 0),
    coalesce(sum(d.r_multiple), 0),
    count(*) filter (where d.with_spike),
    round(100.0 * count(*) filter (where not d.violated) / count(*), 2),
    coalesce(max(d.peak - d.equity), 0)
  from (
    select
      x.*,
      greatest(0, max(x.equity) over (order by x.opened_at, x.id rows unbounded preceding)) as peak
    from (
      select
        t.id,
        t.opened_at,
        t.outcome,
        t.pnl,
        t.r_multiple,
        t.with_spike,
        exists (select 1 from public.rule_violations v where v.trade_id = t.id) as violated,
        sum(t.pnl) over (order by t.opened_at, t.id rows unbounded preceding) as equity
      from public.trades t
      join public.sessions s on s.id = t.session_id
      where s.account_id = p_account and s.date = p_date
    ) x
  ) d
  on conflict (account_id, date) do update set
    trades = excluded.trades,
    wins = excluded.wins,
    losses = excluded.losses,
    pnl = excluded.pnl,
    gross_profit = excluded.gross_profit,
    gross_loss = excluded.gross_loss,
    r_sum = excluded.r_sum,
    with_spike_trades = excluded.with_spike_trades,
    compliance_pct = excluded.compliance_pct,
    max_drawdown = excluded.max_drawdown;
end;
$$;

revoke all on function public.recompute_metrics_daily(uuid, date) from public, anon, authenticated;

create or replace function public.trades_metrics_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recompute_metrics_daily(
      old.account_id,
      (select s.date from public.sessions s where s.id = old.session_id)
    );
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recompute_metrics_daily(
      new.account_id,
      (select s.date from public.sessions s where s.id = new.session_id)
    );
  end if;
  return null;
end;
$$;

create trigger trades_metrics
  after insert or update or delete on public.trades
  for each row execute function public.trades_metrics_trigger();

create or replace function public.violations_metrics_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid := coalesce(new.session_id, old.session_id);
begin
  perform public.recompute_metrics_daily(s.account_id, s.date)
    from public.sessions s
    where s.id = v_session;
  return null;
end;
$$;

create trigger violations_metrics
  after insert or delete on public.rule_violations
  for each row execute function public.violations_metrics_trigger();

-- Si se borra una sesión entera, su día desaparece de las métricas.
create or replace function public.sessions_metrics_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.metrics_daily where account_id = old.account_id and date = old.date;
  return null;
end;
$$;

create trigger sessions_metrics_cleanup
  after delete on public.sessions
  for each row execute function public.sessions_metrics_cleanup();

-- ---------------------------------------------------------------------------
-- Usuario nuevo: reglas por defecto y una estrategia
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.rules (user_id, type, params, action, enabled) values
    (new.id, 'max_trades',                  '{"n": 3}',                          'block', true),
    (new.id, 'max_losses',                  '{"n": 2}',                          'block', true),
    (new.id, 'max_session_minutes',         '{"minutes": 60}',                   'warn',  true),
    (new.id, 'max_risk_pct',                '{"pct": 2}',                        'warn',  true),
    (new.id, 'allowed_hours',               '{"from": "08:00", "to": "11:00"}',  'warn',  false),
    (new.id, 'no_size_increase_after_loss', '{"factor": 1.5}',                   'block', true),
    (new.id, 'min_gap_seconds',             '{"seconds": 180}',                  'warn',  true),
    (new.id, 'max_psych_errors',            '{"n": 2}',                          'block', true);

  insert into public.strategies (user_id, name, context_tf, entry_tf, notes)
  values (new.id, 'Spike en zona', '1H', '1M',
          'Contexto en 1H, entrada en 1M cuando un spike toca la zona y reacciona.');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
