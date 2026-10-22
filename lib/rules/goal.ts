import type { EngineTrade, Rule } from "./types";

export interface GoalProgress {
  goal: number;
  /** Neto de la sesión hasta ahora. */
  net: number;
  /** Máximo neto alcanzado en la sesión. */
  peak: number;
  /** 0–1 (puede pasar de 1). */
  ratio: number;
  reached: boolean;
  /** Si está activa "Proteger la ganancia" y ya llegaste: por debajo de este neto, se para. */
  protectFloor: number | null;
  /** Ya devolviste lo permitido después de llegar. */
  gaveBack: boolean;
}

/** Avance hacia el objetivo del día con las operaciones de la sesión, en orden. */
export function goalProgress(args: {
  sessionTrades: readonly EngineTrade[];
  goalAmount: number | null | undefined;
  rules: readonly Rule[];
}): GoalProgress | null {
  const goal = args.goalAmount;
  if (!goal || !(goal > 0)) return null;
  const ordered = [...args.sessionTrades].sort((a, b) => Date.parse(a.opened_at) - Date.parse(b.opened_at));
  let net = 0;
  let peak = 0;
  for (const t of ordered) {
    net += t.pnl;
    peak = Math.max(peak, net);
  }
  const reached = peak >= goal - 1e-9;
  const protect = args.rules.find((r) => r.type === "protect_profit" && r.enabled);
  const pct = protect?.type === "protect_profit" ? protect.params.pct : null;
  const protectFloor = reached && pct !== null ? Math.round(peak * (1 - pct / 100) * 100) / 100 : null;
  return {
    goal,
    net: Math.round(net * 100) / 100,
    peak: Math.round(peak * 100) / 100,
    ratio: net / goal,
    reached,
    protectFloor,
    gaveBack: protectFloor !== null && net <= protectFloor + 1e-9,
  };
}

/** ¿Se cumplió el objetivo ese día? (neto final ≥ meta). */
export function goalMet(pnl: number, goalAmount: number | null | undefined): boolean | null {
  if (!goalAmount || !(goalAmount > 0)) return null;
  return pnl >= goalAmount - 1e-9;
}
