-- Objetivo del día en dólares y dos reglas nuevas: llegar a la meta y proteger la ganancia.

-- Meta del día en dólares (goal_r queda como su equivalente en R con el stop de ese día).
alter table public.sessions
  add column goal_amount numeric(14, 2) check (goal_amount is null or goal_amount > 0);

-- Datos viejos: si había meta en R, se pasa a dólares con stop de $1.
update public.sessions set goal_amount = goal_r where goal_r is not null and goal_r > 0 and goal_amount is null;

alter type public.rule_type add value if not exists 'daily_goal';
alter type public.rule_type add value if not exists 'protect_profit';
