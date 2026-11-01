import type { StrategyDoc, UserDoc } from "./schema";

/** Reglas con las que arranca todo usuario nuevo (las mismas que tenía la base anterior). */
export const DEFAULT_RULES: UserDoc["rules"] = {
  max_trades: { params: { n: 3 }, action: "block", enabled: true },
  max_losses: { params: { n: 2 }, action: "block", enabled: true },
  max_session_minutes: { params: { minutes: 60 }, action: "warn", enabled: true },
  max_risk_pct: { params: { pct: 2 }, action: "warn", enabled: true },
  allowed_hours: { params: { from: "08:00", to: "11:00" }, action: "warn", enabled: false },
  no_size_increase_after_loss: { params: { factor: 1.5 }, action: "block", enabled: true },
  min_gap_seconds: { params: { seconds: 180 }, action: "warn", enabled: true },
  max_psych_errors: { params: { n: 2 }, action: "block", enabled: true },
  daily_goal: { params: {}, action: "block", enabled: true },
  protect_profit: { params: { pct: 50 }, action: "block", enabled: true },
};

export function defaultStrategy(now: string): StrategyDoc {
  return {
    name: "Spike en zona",
    context_tf: "1H",
    entry_tf: "1M",
    notes: "Contexto en 1H, entrada en 1M cuando un spike toca la zona y reacciona.",
    active: true,
    steps: ["Tendencia clara en 1H", "Zona válida marcada", "Spike toca la zona", "Reacción con 5 velas", "Stop y monto definidos"],
    created_at: now,
  };
}
