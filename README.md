# Racha

Bitácora de trading para índices sintéticos de Deriv — **Boom y Crash**. Registras cada operación a mano en
menos de diez segundos desde el celular, y la app mide tu disciplina además del resultado: reglas que avisan o
bloquean la sesión de verdad, checklist de once puntos, a favor o en contra del spike, curva de capital,
calendario y desgloses.

Secciones:

- **Operar** (`/operar`) — la vista limpia del día a día: check-in, reloj y meta de hoy, registrar, calendario
  de lunes a viernes, operaciones y el balance de la cuenta con retiros y depósitos. Es la pantalla de inicio.
- **Bitácora** (`/journal`) — cuentas reales y demo con todas las estadísticas.
- **Backtesting** (`/backtesting`) — cuentas de práctica sobre datos históricos, sin dinero real. Indicas la
  fecha y hora de cada operación; cada día se vuelve una sesión con las mismas reglas y métricas. Su calendario
  muestra los siete días.
- **Revisión** (`/revision`) — la semana, los domingos.

Las capturas de pantalla se suben a **Cloudinary** como archivos privados.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript estricto · Tailwind CSS v4 · shadcn/ui · Firebase (Auth +
Firestore, vía Admin SDK en el servidor) · Cloudinary · React Hook Form + Zod · Recharts · date-fns · Vitest ·
pnpm · Vercel.

## Cómo está armado (y por qué es rápido)

- **El navegador nunca habla con Firebase.** No se carga ningún SDK de Firebase en el cliente. El login va por
  un Server Action que valida email y contraseña contra Firebase Auth y guarda una *session cookie* httpOnly de
  14 días. Verificarla es local (firma con claves públicas en caché), sin ida a la red.
- **Firestore se lee solo cuando algo cambió.** Cada lectura pasa por la caché de datos de Next
  (`unstable_cache`) con etiquetas por usuario y por cuenta (`lib/db/tags.ts`). Cada Server Action que escribe
  invalida solo lo que tocó (`updateTag`), así ves tu cambio al instante y lo demás sigue saliendo de la caché.
- **Pocos documentos por pantalla.** El resumen de cada día (operaciones, ganadas, P/L, R, cumplimiento,
  drawdown) se guarda dentro del documento de la sesión, y los totales de la cuenta (P/L, depósitos, retiros)
  en el documento de la cuenta. El calendario, los cuatro números, la curva y el balance no suman operaciones:
  leen un documento por día.
- **Transacciones.** Registrar, editar o borrar una operación corre en una transacción que evalúa las reglas,
  bloquea la sesión si corresponde, recalcula el día y ajusta el balance, todo junto.
- **PWA.** El service worker guarda los archivos de la app (caché primero) y una copia de cada página (red
  primero, con la copia si la red tarda o no hay conexión). Las páginas tienen esqueletos de carga y el router
  reutiliza lo visitado hace menos de 30 s.

Modelo en Firestore (todo cuelga del usuario):

```
users/{uid}                      reglas, control mental, frase de pausa
users/{uid}/accounts/{id}        cuenta + pnl_total, deposits_total, withdrawals_total
users/{uid}/strategies/{id}
users/{uid}/sessions/{cuenta_fecha}  un día de una cuenta + metrics (resumen del día)
users/{uid}/trades/{id}          operación con sus violaciones y capturas adentro
users/{uid}/cashflows/{id}       retiros y depósitos
users/{uid}/weekly_reviews/{lunes}
users/{uid}/observations/{id}
```

No hace falta crear índices compuestos: todas las consultas usan un solo campo.

## Configurar Firebase

1. Crea un proyecto en https://console.firebase.google.com.
2. **Authentication → Método de acceso**: activa *Correo electrónico/contraseña*.
3. **Firestore Database → Crear base de datos** (modo producción; la región que quieras).
4. **Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**. Del JSON copia
   `project_id`, `client_email` y `private_key` a `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y
   `FIREBASE_PRIVATE_KEY` (en una línea, entre comillas, con los saltos como `\n`).
5. **Configuración del proyecto → General → Tus apps → Agregar app web**. Copia `apiKey` a
   `FIREBASE_WEB_API_KEY`.
6. Sube las reglas de seguridad (cierran todo acceso directo desde el navegador):

   ```bash
   pnpm dlx firebase-tools@14 deploy --only firestore:rules --project TU_PROJECT_ID
   ```

### Traer tus datos de Supabase

Una sola vez, para no perder tus operaciones:

1. En la app nueva, entra a *Crear cuenta* con el mismo email que usabas.
2. En `.env.local` pon también `SUPABASE_URL` y `SUPABASE_SECRET_KEY` de la base vieja.
3. Corre:

   ```bash
   pnpm migrate:supabase -- --email tu@email.com
   ```

4. En la app: **Ajustes → Datos → Volver a leer mis datos**.

Copia cuentas, estrategias, reglas, control mental, sesiones, operaciones (con violaciones y capturas),
revisiones y observaciones, y recalcula el resumen de cada día y el balance de cada cuenta. Se puede repetir sin
duplicar. Las capturas siguen en Cloudinary, no se mueven.

## Levantarlo en local

Requisitos: Node 20+, pnpm. Para los emuladores de Firebase, además Java 17+ (21 recomendado).

```bash
pnpm install
cp .env.example .env.local
```

Con tu proyecto de Firebase, rellena las variables y arranca con `pnpm dev`.

Sin proyecto (todo local, con emuladores): en `.env.local` pon `FIREBASE_PROJECT_ID=demo-racha` y descomenta
`FIRESTORE_EMULATOR_HOST` y `FIREBASE_AUTH_EMULATOR_HOST`. Después:

```bash
pnpm emulators     # en una terminal
pnpm seed          # datos de ejemplo
pnpm dev
```

Entra en http://localhost:3000 con `SEED_EMAIL` / `SEED_PASSWORD`. El seed crea una cuenta real con 30
sesiones y ~70 operaciones en dos meses, y una cuenta de backtesting. Se puede repetir: borra y recrea solo las
cuentas de ejemplo. Para sembrar en un usuario que ya existe: `pnpm seed -- --email tu@email.com`. Como el seed
escribe por fuera de la app, después toca *Volver a leer mis datos* en Ajustes.

## Cloudinary

1. Crea una cuenta gratuita en https://cloudinary.com.
2. En **Settings → API Keys** copia *Cloud name*, *API key* y *API secret* a `CLOUDINARY_CLOUD_NAME`,
   `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`.

Cómo funciona: el navegador comprime la captura a WebP (máx. 1600 px), el servidor firma una subida atada a
`racha/{user_id}/{trade_id}/{uuid}` y el archivo se guarda como `type: private`. Para verla, el servidor genera
una URL firmada que caduca en una hora, solo para capturas de operaciones del usuario.

## Deploy en Vercel

1. Importa el repo en https://vercel.com/new (framework: Next.js, se detecta solo).
2. Variables de entorno: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`,
   `FIREBASE_WEB_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
3. Deploy.

## Instalar como app (PWA)

Abre la URL en el celular → menú del navegador → *Añadir a pantalla de inicio* (Chrome) o *Compartir → Añadir
a inicio* (Safari). Abre directo en `/operar`.

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción (incluye chequeo de tipos) |
| `pnpm lint` | ESLint |
| `pnpm test` | Tests del motor de reglas y de los cálculos (Vitest) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm emulators` | Emuladores de Firebase (Auth + Firestore) |
| `pnpm seed` | Datos de ejemplo |
| `pnpm migrate:supabase` | Copia tus datos de la base vieja de Supabase |

## Estructura

```
app/                  rutas (operar, journal, backtesting, detalle, revisión, ajustes, login) y Server Actions
components/app/       cabecera, maquetación compartida (Container, Panel), esqueletos e inputs
components/operar/    vista de operar: tarjeta de hoy y balance con retiros
components/journal/   bloques de la bitácora, el temporizador y el formulario de registro
components/trade/     detalle de operación: nota, capturas, editar/borrar
components/settings/  cuentas, reglas, estrategias, control mental
lib/auth.ts           login con Firebase Auth y cookie de sesión
lib/db/               Firestore: modelo, lecturas con caché, transacciones, etiquetas de caché
lib/rules/            motor de reglas puro (sin dependencias) + tests
lib/calc/             R, resultado, a favor del spike, resumen del día, métricas + tests
lib/data.ts           lo que leen las páginas
scripts/              seed y migración desde Supabase
firestore.rules       acceso directo cerrado (todo pasa por el servidor)
```

Decisiones y pendientes: [ROADMAP.md](ROADMAP.md).
