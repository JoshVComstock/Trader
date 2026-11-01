# ROADMAP

## Migración a Firebase (1 nov)

- **Supabase → Firebase.** Auth con email y contraseña de Firebase; datos en Firestore. Las notas de abajo que
  hablan de tablas, RLS y triggers de Postgres describen la versión anterior: esas garantías ahora viven en
  transacciones del Admin SDK (`lib/db/ledger.ts`) y en las reglas de Firestore, que cierran todo acceso directo.
- **Sin SDK de Firebase en el navegador.** El login llama a la API de Identity Toolkit desde un Server Action y
  guarda una *session cookie* de Firebase (httpOnly, 14 días). `verifySessionCookie` es local. El proxy solo
  mira si la cookie existe; la firma se verifica en cada página (`requireUser`).
- **Caché de datos de Next con etiquetas** (`unstable_cache` + `updateTag`, sin `cacheComponents`). Etiquetas por
  usuario: perfil, cuentas, estrategias, libro de cada cuenta, lecturas que cruzan cuentas, observaciones y
  revisiones. Un día de vida como red de seguridad. Escribir por fuera de la app (seed, migración, consola) no
  invalida: para eso está *Ajustes → Datos → Volver a leer mis datos*.
- **Resumen del día dentro de la sesión** (`sessions.metrics`, reemplaza `metrics_daily`) y **totales en la
  cuenta** (`pnl_total`, `deposits_total`, `withdrawals_total`). Se actualizan en la misma transacción que la
  operación. Id de sesión determinista `{cuenta}_{fecha}`: se lee directo, sin consulta.
- Violaciones y capturas van dentro del documento de la operación (antes eran tablas aparte).
- Operaciones del mes: `session_id in [...]` con los ids de los días del mes (de a 30). Ninguna consulta
  necesita índice compuesto.
- **Balance real con retiros y depósitos.** Antes la cuenta mostraba solo el balance inicial en Ajustes y el
  riesgo se calculaba sumando días; ahora `balance = inicial + P/L + depósitos − retiros`, visible en Operar y
  Ajustes. Un retiro no puede superar el balance. La curva de capital arranca en inicial + movimientos para
  terminar en el balance de hoy.
- **Vista Operar** (`/operar`, la de inicio): hoy (check-in, reloj, meta, registrar), calendario, operaciones y
  balance. La bitácora queda para las estadísticas.
- **Calendario de lunes a viernes en cuentas en vivo**; backtesting muestra los siete días. Si igual operaste un
  fin de semana, la semana lo suma y muestra "+ fin de semana".
- **PWA más rápida.** Service worker con caché de archivos (primero caché) y copia de páginas (red primero con
  4 s de espera); borra las copias al salir. `staleTimes.dynamic = 30` y esqueletos de carga en cada ruta.
- Transporte REST de Firestore (`preferRest`) en producción: arranca más rápido en serverless. El emulador usa
  gRPC.

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

**Segunda ronda de ajustes (21 oct)**

- Todo el dinero en dólares con formato `$1,234.50`. Las cuentas son siempre USD (el campo de moneda ya no se
  edita; la columna sigue en la base por si algún día hace falta).
- Cabecera nueva: navegación completa en escritorio (Bitácora, Backtesting, Ajustes, Exportar, tema, salir);
  hamburguesa con panel lateral solo en móvil. En el journal, una segunda fila con cuenta, mes, temporizador y
  el botón de registrar.
- Página más ancha (hasta 1440 px) y escala un poco mayor en pantallas grandes.
- Temporizador de sesión: en el check-in eliges cuánto vas a operar (30/45/60/90 min u otro). Se guarda en
  `sessions.planned_minutes` y se muestra la cuenta regresiva en la barra, en la tira de disciplina y en el
  formulario. Si no se eligió, usa la regla de duración máxima.
- Maquetación compartida en `components/app/layout.tsx` (`Container`, `PageMain`, `PageHeader`, `Panel`) e
  inputs con unidad (`InputGroup`, `Segmented`): todas las tarjetas y formularios usan las mismas piezas.

**Control mental (21 oct)**

- Todo se puede apagar en Ajustes → Control mental (tabla `user_settings`, jsonb `psych`). Lo apagado
  desaparece de la bitácora, del formulario y del check-in.
- Pausa después de una pérdida: dura lo que diga la regla "Pausa mínima entre operaciones" y se cuenta desde
  el cierre de la pérdida. Si esa regla está apagada, no hay pausa. Es una pausa de la interfaz (el botón
  Registrar se bloquea); el servidor sigue registrando la violación de la regla como antes.
- Ansiedad 1–5 por operación (`trades.anxiety`), cruzada con R en la tarjeta "Tú acelerado vs tú tranquilo".
- Tu yo tranquilo: reflexiones de cierre de días con "seguí el plan = sí". Se muestra una por día cuando
  estás bloqueado, en pausa o cerca de un límite.
- Racha de disciplina: días operados seguidos sin violaciones (los días sin operar no cortan). Llegar a un
  límite y bloquear la sesión cuenta como respetar la regla.
- Detector de tilt: en una ventana de 10 minutos, pérdida + stake mayor + contra el spike = tilt; pérdida + una
  de las otras = riesgo. Solo avisa en el formulario, no bloquea.
- Revisión semanal (`/revision`, tabla `weekly_reviews`): aviso los domingos, filtros por cuenta, índice,
  spike, estrategia, estado, resultado y plan. La respuesta aparece en el check-in de la semana siguiente.
- Observaciones de backtesting (tabla `observations`): zonas, patrones y notas con "Se repitió". Las de un
  índice aparecen en el formulario de registro al elegirlo, también en real.
- Recordatorios: notificaciones locales (5 min antes y al terminar la sesión, inicio del horario permitido).
  Llegan con la app abierta o en segundo plano; con la app cerrada del todo haría falta Web Push con un
  servidor (pendiente).

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
- Modo sin conexión real (cola offline de operaciones con service worker). Hoy las páginas se ven sin red,
  pero registrar necesita conexión (las fallidas quedan para reintentar).
- Sincronización con brokers, importación de archivos, IA, comunidad, pagos: fuera de alcance por diseño.
