import type { EngineTrade, Rule, RuleType } from "./types";

export type MeterLevel = "ok" | "near" | "hit";

export interface Meter {
  key: "trades" | "losses" | "psych" | "minutes";
  label: string;
  value: number;
  limit: number | null;
  unit: "" | "min";
  level: MeterLevel;
}

function findRule<T extends RuleType>(rules: readonly Rule[], type: T) {
  return rules.find((r): r is Extract<Rule, { type: T }> => r.type === type && r.enabled);
}

function counterLevel(value: number, limit: number | null): MeterLevel {
  if (limit === null) return "ok";
  if (value >= limit) return "hit";
  if (value > 0 && value >= limit - 1) return "near";
  return "ok";
}

function ratioLevel(value: number, limit: number | null): MeterLevel {
  if (limit === null || limit <= 0) return "ok";
  const r = value / limit;
  if (r >= 1) return "hit";
  if (r >= 0.75) return "near";
  return "ok";
}

/** Medidores de la tira de disciplina para una sesión. */
export function computeMeters(args: {
  sessionTrades: readonly EngineTrade[];
  sessionOpenedAt: string;
  /** Instante contra el que se mide el tiempo (ahora, o el cierre de la sesión). */
  now: string;
  rules: readonly Rule[];
}): Meter[] {
  const { sessionTrades, rules } = args;
  const maxTrades = findRule(rules, "max_trades")?.params.n ?? null;
  const maxLosses = findRule(rules, "max_losses")?.params.n ?? null;
  const maxPsych = findRule(rules, "max_psych_errors")?.params.n ?? null;
  const maxMinutes = findRule(rules, "max_session_minutes")?.params.minutes ?? null;

  const trades = sessionTrades.length;
  const losses = sessionTrades.filter((t) => t.pnl < 0).length;
  const psych = sessionTrades.filter((t) => t.impulse).length;
  const minutes = Math.max(
    0,
    Math.floor((Date.parse(args.now) - Date.parse(args.sessionOpenedAt)) / 60_000),
  );

  return [
    { key: "trades", label: "Operativas", value: trades, limit: maxTrades, unit: "", level: counterLevel(trades, maxTrades) },
    { key: "losses", label: "Pérdidas", value: losses, limit: maxLosses, unit: "", level: counterLevel(losses, maxLosses) },
    { key: "psych", label: "Errores psicológicos", value: psych, limit: maxPsych, unit: "", level: counterLevel(psych, maxPsych) },
    { key: "minutes", label: "Tiempo", value: minutes, limit: maxMinutes, unit: "min", level: ratioLevel(minutes, maxMinutes) },
  ];
}
