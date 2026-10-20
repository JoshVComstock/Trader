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
  })
  .superRefine((v, ctx) => {
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
  currency: z.string().trim().length(3, "Código de 3 letras").toUpperCase(),
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
