import { instrumentLabel, INSTRUMENT_CODES } from "../domain/instruments";
import type { Outcome } from "../domain/types";
import { addDays, localHour, monthRange, weekdayMondayFirst } from "../time-core";
import { round } from "./trade";

/** Una fila de `metrics_daily`. */
export interface DailyMetrics {
  date: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  gross_profit: number;
  gross_loss: number;
  r_sum: number;
  with_spike_trades: number;
  compliance_pct: number;
  max_drawdown: number;
}

export interface Kpis {
  trades: number;
  net: number;
  /** Ganadas sobre ganadas + perdidas. Los empates no cuentan. */
  winRate: number | null;
  /** Ganancia bruta sobre pérdida bruta. Infinito si no hay pérdidas. */
  profitFactor: number | null;
  /** Esperanza en R por operación. */
  expectancyR: number | null;
}

export function computeKpis(rows: readonly DailyMetrics[]): Kpis {
  let trades = 0;
  let wins = 0;
  let losses = 0;
  let net = 0;
  let gp = 0;
  let gl = 0;
  let r = 0;
  for (const d of rows) {
    trades += d.trades;
    wins += d.wins;
    losses += d.losses;
    net += d.pnl;
    gp += d.gross_profit;
    gl += d.gross_loss;
    r += d.r_sum;
  }
  const decided = wins + losses;
  return {
    trades,
    net: round(net, 2),
    winRate: decided > 0 ? wins / decided : null,
    profitFactor: trades === 0 ? null : gl > 0 ? gp / gl : gp > 0 ? Infinity : null,
    expectancyR: trades > 0 ? round(r / trades, 4) : null,
  };
}

export interface EquityPoint {
  date: string;
  equity: number;
  /** Distancia al pico previo, siempre ≤ 0. */
  drawdown: number;
}

/**
 * Curva de capital del mes, con un punto de arranque (balance al cierre del mes anterior)
 * y un punto por cada día con operaciones. El pico se arrastra desde el inicio de la cuenta.
 */
export function equityCurve(
  startBalance: number,
  allRows: readonly DailyMetrics[],
  month: string,
): EquityPoint[] {
  const { from, to } = monthRange(month);
  const sorted = [...allRows].sort((a, b) => a.date.localeCompare(b.date));
  let equity = startBalance;
  let peak = startBalance;
  for (const d of sorted) {
    if (d.date >= from) break;
    equity += d.pnl;
    peak = Math.max(peak, equity);
  }
  const points: EquityPoint[] = [
    { date: addDays(from, -1), equity: round(equity, 2), drawdown: round(equity - peak, 2) },
  ];
  for (const d of sorted) {
    if (d.date < from || d.date > to) continue;
    equity += d.pnl;
    peak = Math.max(peak, equity);
    points.push({ date: d.date, equity: round(equity, 2), drawdown: round(equity - peak, 2) });
  }
  return points;
}

/** Balance actual de una cuenta: inicial más la suma de todos los días. */
export function currentBalance(startBalance: number, allRows: readonly DailyMetrics[]): number {
  return round(allRows.reduce((acc, d) => acc + d.pnl, startBalance), 2);
}

export interface CalendarCell {
  date: string;
  inMonth: boolean;
  day: DailyMetrics | null;
}

export interface CalendarWeek {
  cells: CalendarCell[];
  summary: { trades: number; wins: number; losses: number; pnl: number; r: number };
}

/** Grilla de 6 semanas × 7 días (lunes primero) con resumen semanal. */
export function calendarWeeks(month: string, rows: readonly DailyMetrics[]): CalendarWeek[] {
  const { from } = monthRange(month);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const start = addDays(from, -weekdayMondayFirst(from));
  const weeks: CalendarWeek[] = [];
  for (let w = 0; w < 6; w++) {
    const cells: CalendarCell[] = [];
    const summary = { trades: 0, wins: 0, losses: 0, pnl: 0, r: 0 };
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, w * 7 + i);
      const inMonth = date.slice(0, 7) === month;
      const day = inMonth ? (byDate.get(date) ?? null) : null;
      if (day) {
        summary.trades += day.trades;
        summary.wins += day.wins;
        summary.losses += day.losses;
        summary.pnl += day.pnl;
        summary.r += day.r_sum;
      }
      cells.push({ date, inMonth, day });
    }
    summary.pnl = round(summary.pnl, 2);
    summary.r = round(summary.r, 2);
    weeks.push({ cells, summary });
  }
  return weeks;
}

/** Lo mínimo de una operación para los desgloses. */
export interface BreakdownTrade {
  instrument: string;
  with_spike: boolean;
  opened_at: string;
  pnl: number;
  r_multiple: number;
  outcome: Outcome;
}

export interface Bucket {
  key: string;
  label: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  r: number;
  winRate: number | null;
}

function bucket(key: string, label: string, trades: readonly BreakdownTrade[]): Bucket {
  const wins = trades.filter((t) => t.outcome === "win").length;
  const losses = trades.filter((t) => t.outcome === "loss").length;
  return {
    key,
    label,
    trades: trades.length,
    wins,
    losses,
    pnl: round(trades.reduce((a, t) => a + t.pnl, 0), 2),
    r: round(trades.reduce((a, t) => a + t.r_multiple, 0), 2),
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
  };
}

/** Por índice, en el orden del catálogo, solo los operados. */
export function byInstrument(trades: readonly BreakdownTrade[]): Bucket[] {
  return INSTRUMENT_CODES.map((code) =>
    bucket(code, instrumentLabel(code), trades.filter((t) => t.instrument === code)),
  ).filter((b) => b.trades > 0);
}

export function bySpike(trades: readonly BreakdownTrade[]): { with: Bucket; against: Bucket } {
  return {
    with: bucket("with", "A favor del spike", trades.filter((t) => t.with_spike)),
    against: bucket("against", "Contra el spike", trades.filter((t) => !t.with_spike)),
  };
}

/** P/L por hora de La Paz, solo las horas con operaciones. */
export function byHour(trades: readonly BreakdownTrade[]): Bucket[] {
  const groups = new Map<number, BreakdownTrade[]>();
  for (const t of trades) {
    const h = localHour(t.opened_at);
    const list = groups.get(h) ?? [];
    list.push(t);
    groups.set(h, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([h, list]) =>
      bucket(String(h), `${String(h).padStart(2, "0")}:00`, list),
    );
}
