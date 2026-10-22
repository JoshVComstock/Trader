-- Reglas de objetivo para todos los usuarios (va en otra migración: un valor nuevo de enum no se
-- puede usar en la misma transacción en que se crea).

insert into public.rules (user_id, type, params, action, enabled)
select u.id, 'daily_goal', '{}'::jsonb, 'block', true from auth.users u
on conflict (user_id, type) do nothing;

insert into public.rules (user_id, type, params, action, enabled)
select u.id, 'protect_profit', '{"pct": 50}'::jsonb, 'block', true from auth.users u
on conflict (user_id, type) do nothing;

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
    (new.id, 'max_psych_errors',            '{"n": 2}',                          'block', true),
    (new.id, 'daily_goal',                  '{}',                                'block', true),
    (new.id, 'protect_profit',              '{"pct": 50}',                       'block', true);

  insert into public.strategies (user_id, name, context_tf, entry_tf, notes, steps)
  values (new.id, 'Spike en zona', '1H', '1M',
          'Contexto en 1H, entrada en 1M cuando un spike toca la zona y reacciona.',
          '["Tendencia clara en 1H", "Zona válida marcada", "Spike toca la zona", "Reacción con 5 velas", "Stop y monto definidos"]'::jsonb);

  return new;
end;
$$;
