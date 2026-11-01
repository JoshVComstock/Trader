import type { Outcome } from "../domain/types";
import type { DailyMetrics } from "./metrics";
import { round } from "./trade";

export interface DailyTrade {
  id: string;
  opened_at: string;
  outcome: Outcome;
  pnl: number;
  r_multiple: number;
  with_spike: boolean;
  /** Rompió al menos una regla. */
  violated: boolean;
}

export type DayMetrics = Omit<DailyMetrics, "date">;

/**
 * Resumen de un día a partir de sus operaciones. Se guarda junto a la sesión cada vez que cambia
 * una operación, así el calendario y las métricas no tienen que leer las operaciones.
 * Devuelve null si el día quedó sin operaciones.
 */
export function computeDayMetrics(trades: readonly DailyTrade[]): DayMetrics | null {
  if (trades.length === 0) return null;
  const sorted = [...trades].sort((a, b) => a.opened_at.localeCompare(b.opened_at) || a.id.localeCompare(b.id));
  let wins = 0;
  let losses = 0;
  let pnl = 0;
  let gp = 0;
  let gl = 0;
  let r = 0;
  let spike = 0;
  let clean = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of sorted) {
    if (t.outcome === "win") wins++;
    if (t.outcome === "loss") losses++;
    pnl += t.pnl;
    if (t.pnl > 0) gp += t.pnl;
    if (t.pnl < 0) gl -= t.pnl;
    r += t.r_multiple;
    if (t.with_spike) spike++;
    if (!t.violated) clean++;
    // El pico arranca en cero: el drawdown mide cuánto bajaste desde lo mejor del día.
    peak = Math.max(peak, pnl);
    maxDd = Math.max(maxDd, peak - pnl);
  }
  return {
    trades: sorted.length,
    wins,
    losses,
    pnl: round(pnl, 2),
    gross_profit: round(gp, 2),
    gross_loss: round(gl, 2),
    r_sum: round(r, 4),
    with_spike_trades: spike,
    compliance_pct: round((100 * clean) / sorted.length, 2),
    max_drawdown: round(maxDd, 2),
  };
}
