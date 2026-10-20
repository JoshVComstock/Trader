# Racha

Bitácora de trading para índices sintéticos de Deriv — **Boom y Crash**. Registras cada operación a mano en
menos de diez segundos desde el celular, y la app mide tu disciplina además del resultado: reglas que avisan o
bloquean la sesión de verdad, checklist de once puntos, a favor o en contra del spike, curva de capital,
calendario y desgloses.

Tiene dos secciones con la misma mecánica:

- **Bitácora** (`/journal`) — cuentas reales y demo.
- **Backtesting** (`/backtesting`) — cuentas de práctica sobre datos históricos, sin dinero real. Indicas la
  fecha y hora de cada operación; cada día se vuelve una sesión con las mismas reglas y métricas.

Las capturas de pantalla se suben a **Cloudinary** como archivos privados.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript estricto · Tailwind CSS v4 · shadcn/ui · Supabase (Postgres,
Auth, RLS) · Cloudinary · React Hook Form + Zod · Recharts · date-fns · Vitest · pnpm · Vercel.

## Levantarlo en local

Requisitos: Node 20+, pnpm y Docker (para Supabase local).

```bash
pnpm install
cp .env.example .env.local
pnpm exec supabase start
```

`supabase start` aplica las migraciones de `supabase/migrations` y muestra las claves. Copia en `.env.local`:

- `API_URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `PUBLISHABLE_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SECRET_KEY` → `SUPABASE_SECRET_KEY`

(Si las pierdes: `pnpm exec supabase status`.)

Carga los datos de ejemplo y arranca:

```bash
pnpm seed
pnpm dev
```

Entra en http://localhost:3000 con `SEED_EMAIL` / `SEED_PASSWORD` de tu `.env.local`. El seed crea una cuenta
real con 30 sesiones y ~70 operaciones en dos meses, y una cuenta de backtesting. Se puede repetir: borra y
recrea solo las cuentas de ejemplo.

Para sembrar en un usuario que ya existe: `pnpm seed -- --email tu@email.com`.

## Supabase en la nube

1. Crea un proyecto en https://supabase.com.
2. Vincula y sube las migraciones:

   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref TU_PROJECT_REF
   pnpm exec supabase db push
   ```

3. En **Authentication → URL Configuration**, pon tu dominio de Vercel como *Site URL* y añade
   `https://TU_DOMINIO/auth/confirm` a las *Redirect URLs*.
4. Opcional: `pnpm seed` con las variables apuntando al proyecto remoto para tener datos de ejemplo.

## Cloudinary

1. Crea una cuenta gratuita en https://cloudinary.com.
2. En **Settings → API Keys** copia *Cloud name*, *API key* y *API secret* a `CLOUDINARY_CLOUD_NAME`,
   `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`.

Cómo funciona: el navegador comprime la captura a WebP (máx. 1600 px), el servidor firma una subida atada a
`racha/{user_id}/{trade_id}/{uuid}` y el archivo se guarda como `type: private`. Para verla, el servidor genera
una URL firmada que caduca en una hora, y solo la genera para capturas que la RLS de `attachments` le deja leer
a ese usuario. Otro usuario no puede ni listar ni abrir tus capturas.

## Deploy en Vercel

1. Importa el repo en https://vercel.com/new (framework: Next.js, se detecta solo).
2. Variables de entorno: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. `SUPABASE_SECRET_KEY` no hace falta
   en Vercel: solo la usa el seed.
3. Deploy.

## Instalar como app (PWA)

Abre la URL en el celular → menú del navegador → *Añadir a pantalla de inicio* (Chrome) o *Compartir → Añadir
a inicio* (Safari). Abre directo en `/journal`.

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción (incluye chequeo de tipos) |
| `pnpm lint` | ESLint |
| `pnpm test` | Tests del motor de reglas y de los cálculos (Vitest) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm seed` | Datos de ejemplo |

## Estructura

```
app/                  rutas (journal, backtesting, detalle, ajustes, login) y Server Actions
components/journal/   los siete bloques del journal y el formulario de registro
components/trade/     detalle de operación: nota, capturas, editar/borrar
components/settings/  cuentas, reglas, estrategias
lib/rules/            motor de reglas puro (sin dependencias) + tests
lib/calc/             R, resultado, a favor del spike, métricas + tests
lib/data.ts           lecturas del servidor
supabase/migrations/  esquema, RLS, triggers de bloqueo y de métricas
scripts/seed.ts       datos de ejemplo
```

Decisiones y pendientes: [ROADMAP.md](ROADMAP.md).
