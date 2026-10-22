import { z } from "zod";
import { CHECKLIST_KEYS, type Checklist } from "./domain/checklist";
import { INSTRUMENT_CODES } from "./domain/instruments";
import type { Rule } from "./rules/types";

const money = z
  .number({ error: "Escribe un número" })
  .finite("Escribe un número")
  .max(1_000_000, "Demasiado grande");

const positiveMoney = money.positive("Tiene que ser mayor que cero");

export const moodSchema = z.enum(["tranquilo", "acelerado", "cansado"]);
export const directionSchema = z.enum(["buy", "sell"]);
export const outcomeSchema = z.enum(["win", "loss", "tie"]);
export const instrumentSchema = z.enum(INSTRUMENT_CODES, { error: "Elige un índice" });

export const checklistSchema = z.object(
  Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, z.boolean()])) as Record<
    keyof Checklist,
    z.ZodBoolean
  >,
);

const isoDate = z.iso.datetime({ offset: true, error: "Fecha y hora inválidas" });

// ---------------------------------------------------------------------------
// Operación — el mismo esquema valida en el navegador y en el Server Action.
// ---------------------------------------------------------------------------
export const tradeInputSchema = z
  .object({
    /** Lo genera el cliente: permite reintentar sin duplicar. */
    id: z.uuid(),
    account_id: z.uuid({ error: "Elige una cuenta" }),
    result: outcomeSchema,
    instrument: instrumentSchema,
    direction: directionSchema,
    stake: positiveMoney,
    strategy_id: z.uuid().nullable(),
    mood: moodSchema,
    tp: positiveMoney.nullable(),
    /** P/L real si no coincide con el SL/TP fijo (cierre parcial, comisión…). */
    pnl: money.nullable(),
    opened_at: isoDate.nullable(),
    closed_at: isoDate.nullable(),
    note: z.string().trim().max(4000, "Máximo 4000 caracteres").nullable(),
    checklist: checklistSchema,
    /** Ansiedad / ganas de recuperar, 1–5. Opcional: se puede apagar en Ajustes. */
    anxiety: z.number().int().min(1).max(5).nullable().default(null),
    /** Monto de entrada con multiplicador (ej. $10). El riesgo real es `stake` (tu stop). */
    entry_amount: positiveMoney.nullable().default(null),
    multiplier: z.number().int("Número entero").min(1).max(10000).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    // Con multiplicadores el spike paga lo que paga: si ganaste, hay que escribir cuánto.
    if (v.result === "win" && v.pnl === null && v.tp === null) {
      ctx.addIssue({ code: "custom", path: ["pnl"], message: "Escribe cuánto ganaste" });
    }
    if (v.entry_amount !== null && v.stake > v.entry_amount) {
      ctx.addIssue({ code: "custom", path: ["stake"], message: "El stop no puede ser mayor que lo que invertiste" });
    }
    if (v.pnl !== null) {
      const sign = Math.sign(v.pnl);
      const expected = v.result === "win" ? 1 : v.result === "loss" ? -1 : 0;
      if (sign !== expected) {
        ctx.addIssue({
          code: "custom",
          path: ["pnl"],
          message: "El P/L no coincide con el resultado",
        });
      }
    }
    if (v.opened_at && v.closed_at && Date.parse(v.closed_at) < Date.parse(v.opened_at)) {
      ctx.addIssue({
        code: "custom",
        path: ["closed_at"],
        message: "El cierre no puede ser antes de la apertura",
      });
    }
  });

export type TradeInput = z.infer<typeof tradeInputSchema>;

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------
export const checkinSchema = z.object({
  account_id: z.uuid(),
  mood_before: moodSchema,
  read_rules: z.boolean(),
  goal_r: z.number().finite().min(-100).max(100).nullable(),
  /** Meta del día en dólares. */
  goal_amount: z.number().finite().positive("La meta tiene que ser mayor que cero").max(1_000_000).nullable().default(null),
  planned_minutes: z.number().int().min(5, "Mínimo 5 minutos").max(600, "Máximo 10 horas").nullable(),
});
export type CheckinInput = z.infer<typeof checkinSchema>;

export const closeSessionSchema = z.object({
  session_id: z.uuid(),
  followed_plan: z.boolean(),
  journal: z.string().trim().max(4000).nullable(),
});
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------
export const accountSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1, "Ponle un nombre").max(60),
  kind: z.enum(["real", "demo", "backtest"]),
  // Por ahora todas las cuentas van en dólares.
  currency: z.literal("USD").default("USD"),
  start_balance: money.min(0, "No puede ser negativo"),
});
export type AccountInput = z.infer<typeof accountSchema>;

export const strategySchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Ponle un nombre").max(60),
  context_tf: z.string().trim().min(1).max(10),
  entry_tf: z.string().trim().min(1).max(10),
  notes: z.string().trim().max(2000).nullable(),
  active: z.boolean(),
  steps: z.array(z.string().trim().min(1, "Paso vacío").max(80)).max(12, "Máximo 12 pasos").default([]),
});
export type StrategyInput = z.infer<typeof strategySchema>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM");
const int = (min: number, max: number) => z.number().int("Número entero").min(min).max(max);

export const ruleParamsSchemas = {
  max_trades: z.object({ n: int(1, 50) }),
  max_losses: z.object({ n: int(1, 50) }),
  max_session_minutes: z.object({ minutes: int(5, 24 * 60) }),
  max_risk_pct: z.object({ pct: z.number().positive().max(100) }),
  allowed_hours: z.object({ from: hhmm, to: hhmm }),
  no_size_increase_after_loss: z.object({ factor: z.number().min(1).max(10) }),
  min_gap_seconds: z.object({ seconds: int(0, 24 * 3600) }),
  max_psych_errors: z.object({ n: int(1, 50) }),
  daily_goal: z.object({}).strict(),
  protect_profit: z.object({ pct: int(10, 90) }),
} as const;

const ruleAction = z.enum(["warn", "block"]);

export const ruleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("max_trades"), params: ruleParamsSchemas.max_trades, action: ruleAction, enabled: z.boolean() }),
  z.object({ type: z.literal("max_losses"), params: ruleParamsSchemas.max_losses, action: ruleAction, enabled: z.boolean() }),
  z.object({ type: z.literal("max_session_minutes"), params: ruleParamsSchemas.max_session_minutes, action: ruleAction, enabled: z.boolean() }),
  z.object({ type: z.literal("max_risk_pct"), params: ruleParamsSchemas.max_risk_pct, action: ruleAction, enabled: z.boolean() }),
  z.object({ type: z.literal("allowed_hours"), params: ruleParamsSchemas.allowed_hours, action: ruleAction, enabled: z.boolean() }),
  z.object({ type: z.literal("no_size_increase_after_loss"), params: ruleParamsSchemas.no_size_increase_after_loss, action: ruleAction, enabled: z.boolean() }),
  z.object({ type: z.literal("min_gap_seconds"), params: ruleParamsSchemas.min_gap_seconds, action: ruleAction, enabled: z.boolean() }),
  z.object({ type: z.literal("max_psych_errors"), params: ruleParamsSchemas.max_psych_errors, action: ruleAction, enabled: z.boolean() }),
  z.object({ type: z.literal("daily_goal"), params: z.object({}).catch({}), action: ruleAction, enabled: z.boolean() }),
  z.object({ type: z.literal("protect_profit"), params: ruleParamsSchemas.protect_profit, action: ruleAction, enabled: z.boolean() }),
]);

/** Convierte filas de `rules` (params jsonb) en reglas tipadas; descarta las inválidas. */
export function parseRules(
  rows: readonly { type: string; params: unknown; action: string; enabled: boolean }[],
): Rule[] {
  const out: Rule[] = [];
  for (const row of rows) {
    const parsed = ruleSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export const userSettingsSchema = z.object({
  psych: z.record(z.string(), z.boolean()),
  pause_phrase: z.string().trim().max(280, "Máximo 280 caracteres").nullable(),
});

export const weeklyReviewSchema = z.object({
  week_start: z.iso.date(),
  answer: z.string().trim().min(1, "Escribe qué vas a cambiar").max(2000),
});

export const observationSchema = z.object({
  id: z.uuid().optional(),
  account_id: z.uuid().nullable(),
  instrument: instrumentSchema.nullable(),
  kind: z.enum(["zona", "patron", "nota"]),
  level: z.number().finite().positive("Precio inválido").nullable(),
  timeframe: z.string().trim().max(10).nullable(),
  note: z.string().trim().min(1, "Describe lo que viste").max(1000),
});
export type ObservationInput = z.infer<typeof observationSchema>;

export const noteSchema = z.object({
  trade_id: z.uuid(),
  note: z.string().trim().max(4000).nullable(),
});

export const attachmentSchema = z.object({
  trade_id: z.uuid(),
  public_id: z.string().min(1).max(300),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive().max(10_000_000),
});
