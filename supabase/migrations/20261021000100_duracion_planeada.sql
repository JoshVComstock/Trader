-- Cuánto tiempo dijiste en el check-in que ibas a operar. Alimenta el temporizador de la sesión.
alter table public.sessions
  add column planned_minutes integer check (planned_minutes is null or planned_minutes between 5 and 600);
