# ROADMAP

## Decisiones tomadas en la v0

**Cambios respecto al prompt original, pedidos por el usuario**

- **Capturas en Cloudinary en lugar de Supabase Storage.** Subida directa del navegador con firma del servidor
  (`type: private`, public_id `racha/{user_id}/{trade_id}/{uuid}`). Se ven con `private_download_url` firmada
  que caduca en una hora. El servidor lee de Cloudinary el ancho/alto/peso reales al registrar la captura; no se
  confía en el cliente. La tabla `attachments` sigue con RLS y además tiene un `check` que obliga a que la ruta
  sea del dueño.
- **Sección de backtesting.** El prompt excluía "backtesting, replay, velas"; el usuario pidió explícitamente una
  sección igual a la bitácora pero sin dinero real. Se resolvió como un tercer tipo de cuenta (`backtest`) con su
  propia página `/backtesting`. Cada operación lleva fecha y hora obligatorias; la sesión se crea sola por día
  de la operación (sin check-in), con las mismas reglas, bloqueo y métricas. No hay replay ni gráficos de velas.

**Técnicas**

- `cacheComponents` desactivado: toda la app es autenticada y dinámica; no compensa la complejidad.
- Next 16 renombró `middleware` a `proxy`: el refresco de sesión de Supabase vive en `proxy.ts`.
- Se reemplazó el paquete `cn` que instala shadcn por `clsx` + `tailwind-merge` (el primero daba clases
  distintas en servidor y cliente → error de hidratación).
- El formulario de registro desactiva React Compiler (`"use no memo"`): React Hook Form muta estado interno y
  sus `Controller` se quedaban un render atrás.
- **Bloqueo real en la base, no solo en el Server Action.** Un trigger rechaza operaciones nuevas en sesiones
  `blocked` o `closed`, y otro impide pasar una sesión de `blocked` a otro estado. Así no se salta ni llamando
  a la API de Supabase directo con la clave pública.
- Las violaciones (`rule_violations`) no tienen política de update/delete: quedan como registro.
- **Límite alcanzado ≠ violación.** Con `max_trades = 3`, la tercera operación es legal y bloquea la sesión
  (mensaje en palabras del usuario); la cuarta sería la violación, pero el servidor ya la rechaza. Igual con
  `max_losses` y `max_psych_errors`. El motor devuelve `violations` y `limits` por separado.
- `allowed_hours` es `[desde, hasta)`: a la hora de cierre ya estás fuera. Soporta franjas que cruzan medianoche.
- `min_gap_seconds` mide desde el cierre de la anterior (o desde su apertura si no se registró el cierre).
- `max_session_minutes` mide desde el check-in hasta la apertura de la operación.
- El P/L se deduce del resultado con SL/TP fijos (ganada = TP, perdida = −stake, empate = 0). En *Más detalle*
  se puede escribir el P/L real (cierres parciales); tiene que coincidir en signo con el resultado.
- `moved_sl = !checklist.kept_sl`; `in_plan` = contexto y entrada completos y sin impulso. El checklist se
  pre-rellena con el plan cumplido (o con el de la operación anterior) para no frenar el registro: se desmarca
  lo que falló.
- `metrics_daily` tiene además `gross_profit`, `gross_loss` y `with_spike_trades` (el profit factor no se puede
  sacar de las columnas del prompt). La recalculan triggers en `trades` y `rule_violations`.
- `max_drawdown` de `metrics_daily` es intradía. La curva del journal es por día y arrastra el pico desde el
  inicio de la cuenta.
- Win rate = ganadas / (ganadas + perdidas). Los empates no cuentan.
- Los cuatro números, el calendario y la curva leen de `metrics_daily`. Los tres desgloses (índice, spike, hora)
  y la tabla leen las operaciones **del mes visible**, no la tabla completa.
- Se añadió `sessions.blocked_reason` para mostrar el aviso de bloqueo con el texto exacto de la regla.
- Guardado optimista sin TanStack Query: un store pequeño (`useSyncExternalStore`) con las operaciones
  pendientes; las que fallan se guardan en `localStorage` con Reintentar / Editar / Descartar. El id lo genera
  el cliente, así reintentar no duplica.
- Las reglas por defecto se crean con un trigger al registrarse el usuario (3 operativas y 2 pérdidas bloquean;
  horario permitido viene desactivado).
- Exportar CSV usa una ruta (`/api/export`) porque un Server Action no puede devolver una descarga.
- Seed como script (`pnpm seed`, con `tsx`) en vez de `seed.sql`: necesita un usuario de Auth y pasa por el
  mismo motor de reglas. `tsx` es dependencia de desarrollo.
- Iconos de la PWA generados con `ImageResponse` (sin archivos binarios en el repo). Service worker mínimo, sin
  caché de datos.

## Fuera de la v0 (anotado para después)

- Editar una operación no vuelve a pasar por el motor de reglas; las violaciones originales se quedan.
- Borrar cuentas con operaciones (hoy se impide; habría que exportar y confirmar).
- Edición de varias capturas a la vez, recorte, anotaciones sobre la imagen.
- Notificación al acercarse al tiempo máximo de sesión sin necesidad de registrar.
- Estadísticas comparadas real vs backtesting de la misma estrategia.
- Filtros de la tabla por índice, estado mental o regla rota.
- Modo sin conexión real (cola offline de operaciones con service worker).
- Transacción única para "operación + violaciones + bloqueo" (hoy son tres escrituras; el trigger de la base
  garantiza el bloqueo igual).
- Sincronización con brokers, importación de archivos, IA, comunidad, pagos: fuera de alcance por diseño.
