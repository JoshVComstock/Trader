export type Direction = "buy" | "sell";
export type Outcome = "win" | "loss" | "tie";
export type Mood = "tranquilo" | "acelerado" | "cansado";
export type AccountKind = "real" | "demo" | "backtest";
export type SessionStatus = "open" | "closed" | "blocked";
export type InstrumentFamily = "boom" | "crash";

export const DIRECTIONS: readonly Direction[] = ["buy", "sell"];
export const OUTCOMES: readonly Outcome[] = ["win", "loss", "tie"];
export const MOODS: readonly Mood[] = ["tranquilo", "acelerado", "cansado"];
export const ACCOUNT_KINDS: readonly AccountKind[] = ["real", "demo", "backtest"];

export const DIRECTION_LABEL: Record<Direction, string> = {
  buy: "Compra",
  sell: "Venta",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  win: "Ganada",
  loss: "Perdida",
  tie: "Empate",
};

export const MOOD_LABEL: Record<Mood, string> = {
  tranquilo: "Tranquilo",
  acelerado: "Acelerado",
  cansado: "Cansado",
};

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  real: "Real",
  demo: "Demo",
  backtest: "Backtesting",
};

/** Modo de la bitácora: dinero real/demo en vivo, o backtesting sobre datos históricos. */
export type JournalMode = "live" | "backtest";

export function kindsForMode(mode: JournalMode): AccountKind[] {
  return mode === "backtest" ? ["backtest"] : ["real", "demo"];
}

export function modeForKind(kind: AccountKind): JournalMode {
  return kind === "backtest" ? "backtest" : "live";
}
