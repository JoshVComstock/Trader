-- Modalidad con multiplicadores y pasos de estrategia.

-- Operativa con multiplicadores (Deriv): entras con un monto (ej. $10 x200), arriesgas un stop fijo
-- (ej. $1, que sigue siendo `stake` = 1R) y cobras lo que dé el spike.
alter table public.trades
  add column entry_amount numeric(14, 2) check (entry_amount is null or entry_amount > 0),
  add column multiplier integer check (multiplier is null or multiplier between 1 and 10000);

-- Pasos de la estrategia, en orden: "Zona clara en 1H", "5 velas de confirmación"…
alter table public.strategies
  add column steps jsonb not null default '[]'::jsonb
  check (jsonb_typeof(steps) = 'array');

update public.strategies
   set steps = '["Tendencia clara en 1H", "Zona válida marcada", "Spike toca la zona", "Reacción con 5 velas", "Stop y monto definidos"]'::jsonb
 where steps = '[]'::jsonb;

-- Una sesión cerrada en vivo no se reabre: se vuelve a operar mañana.
-- (En backtesting los días se reabren solos para seguir cargando datos históricos.)
create or replace function public.sessions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind public.account_kind;
begin
  if old.status = 'blocked' and new.status <> 'blocked' then
    raise exception 'Una sesión bloqueada no se puede reabrir'
      using errcode = 'P0001';
  end if;
  if old.status = 'closed' and new.status = 'open' then
    select kind into v_kind from public.accounts where id = old.account_id;
    if v_kind <> 'backtest' then
      raise exception 'SESSION_CLOSED_FOR_TODAY' using errcode = 'P0001',
        hint = 'Cerraste la sesión de hoy. Se vuelve a abrir mañana.';
    end if;
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

-- Las estrategias nuevas también nacen con pasos.
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

  insert into public.strategies (user_id, name, context_tf, entry_tf, notes, steps)
  values (new.id, 'Spike en zona', '1H', '1M',
          'Contexto en 1H, entrada en 1M cuando un spike toca la zona y reacciona.',
          '["Tendencia clara en 1H", "Zona válida marcada", "Spike toca la zona", "Reacción con 5 velas", "Stop y monto definidos"]'::jsonb);

  return new;
end;
$$;
