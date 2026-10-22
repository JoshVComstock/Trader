import type { RuleParamsMap, RuleType } from "./types";

interface FieldMeta {
  key: string;
  label: string;
  kind: "int" | "decimal" | "time";
  suffix?: string;
}

export interface RuleMeta<T extends RuleType = RuleType> {
  title: string;
  description: string;
  fields: FieldMeta[];
  defaults: RuleParamsMap[T];
}

/** Textos y campos de cada tipo de regla, para Ajustes. */
export const RULE_META: { [T in RuleType]: RuleMeta<T> } = {
  max_trades: {
    title: "Máximo de operativas por día",
    description: "Al llegar al número, se acaba la sesión.",
    fields: [{ key: "n", label: "Operativas", kind: "int" }],
    defaults: { n: 3 },
  },
  max_losses: {
    title: "Máximo de pérdidas por día",
    description: "Cuenta las operaciones perdidas de la sesión.",
    fields: [{ key: "n", label: "Pérdidas", kind: "int" }],
    defaults: { n: 2 },
  },
  max_session_minutes: {
    title: "Duración máxima de la sesión",
    description: "Desde el check-in hasta la última entrada.",
    fields: [{ key: "minutes", label: "Minutos", kind: "int", suffix: "min" }],
    defaults: { minutes: 60 },
  },
  max_risk_pct: {
    title: "Riesgo máximo por operación",
    description: "Stake sobre el balance de la cuenta.",
    fields: [{ key: "pct", label: "Porcentaje", kind: "decimal", suffix: "%" }],
    defaults: { pct: 2 },
  },
  allowed_hours: {
    title: "Horario permitido",
    description: "Hora de La Paz. Fuera de la franja es violación.",
    fields: [
      { key: "from", label: "Desde", kind: "time" },
      { key: "to", label: "Hasta", kind: "time" },
    ],
    defaults: { from: "08:00", to: "11:00" },
  },
  no_size_increase_after_loss: {
    title: "No subir el riesgo después de perder",
    description: "Antimartingala: el stake no puede crecer más que el factor tras una pérdida.",
    fields: [{ key: "factor", label: "Factor máximo", kind: "decimal", suffix: "×" }],
    defaults: { factor: 1.5 },
  },
  min_gap_seconds: {
    title: "Pausa mínima entre operaciones",
    description: "Anti revenge trading: tiempo desde el cierre de la anterior.",
    fields: [{ key: "seconds", label: "Segundos", kind: "int", suffix: "s" }],
    defaults: { seconds: 180 },
  },
  max_psych_errors: {
    title: "Máximo de errores psicológicos",
    description: "Cuenta las operaciones marcadas como impulso.",
    fields: [{ key: "n", label: "Errores", kind: "int" }],
    defaults: { n: 2 },
  },
  daily_goal: {
    title: "Objetivo del día",
    description: "Al llegar a la meta que pones en el check-in, se acaba el día. Bloquea protege lo ganado.",
    fields: [],
    defaults: {},
  },
  protect_profit: {
    title: "Proteger la ganancia",
    description: "Después de llegar a la meta, si devuelves este porcentaje de lo ganado, se para.",
    fields: [{ key: "pct", label: "Puedes devolver", kind: "int", suffix: "%" }],
    defaults: { pct: 50 },
  },
};
