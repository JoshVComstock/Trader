export const RULE_TYPES = [
  "max_trades",
  "max_losses",
  "max_session_minutes",
  "max_risk_pct",
  "allowed_hours",
  "no_size_increase_after_loss",
  "min_gap_seconds",
  "max_psych_errors",
  "daily_goal",
  "protect_profit",
] as const;

export type RuleType = (typeof RULE_TYPES)[number];
export type RuleAction = "warn" | "block";

export interface RuleParamsMap {
  max_trades: { n: number };
  max_losses: { n: number };
  max_session_minutes: { minutes: number };
  max_risk_pct: { pct: number };
  allowed_hours: { from: string; to: string };
  no_size_increase_after_loss: { factor: number };
  min_gap_seconds: { seconds: number };
  max_psych_errors: { n: number };
  /** La meta se escribe en el check-in de cada día (sessions.goal_amount). */
  daily_goal: Record<string, never>;
  /** Tras llegar a la meta, cuánto de lo ganado puedes devolver antes de parar. */
  protect_profit: { pct: number };
}

export type RuleOf<T extends RuleType> = {
  type: T;
  params: RuleParamsMap[T];
  action: RuleAction;
  enabled: boolean;
};

export type Rule = { [T in RuleType]: RuleOf<T> }[RuleType];

/** Lo mínimo de una operación que el motor necesita. Fechas en ISO UTC. */
export interface EngineTrade {
  opened_at: string;
  closed_at: string | null;
  stake: number;
  pnl: number;
  impulse: boolean;
}

export interface EngineInput {
  /** La operación que se quiere registrar. */
  candidate: EngineTrade;
  /** Las operaciones ya registradas en la sesión (sin la candidata). */
  sessionTrades: readonly EngineTrade[];
  /** Cuándo empezó la sesión. */
  sessionOpenedAt: string;
  /** Balance de la cuenta antes de la operación. */
  balance: number;
  rules: readonly Rule[];
  /** Objetivo del día en dólares, si lo pusiste en el check-in. */
  goalAmount?: number | null;
}

/** La operación rompió una regla. Se guarda como fila en `rule_violations`. */
export interface Violation {
  ruleType: RuleType;
  action: RuleAction;
  message: string;
}

/** La operación es legal pero con ella se llega al límite: aquí se para. */
export interface LimitReached {
  ruleType: RuleType;
  action: RuleAction;
  message: string;
}

export interface EngineResult {
  violations: Violation[];
  limits: LimitReached[];
  /** Si es verdadero, la sesión pasa a `blocked` después de guardar. */
  shouldBlock: boolean;
}
