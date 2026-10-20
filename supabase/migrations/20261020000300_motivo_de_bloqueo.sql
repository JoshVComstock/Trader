-- El aviso de bloqueo se muestra con las palabras de la regla que lo causó.
alter table public.sessions add column blocked_reason text;
