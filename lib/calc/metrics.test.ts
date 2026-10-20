import { describe, expect, it } from "vitest";
import {
  byHour,
  byInstrument,
  bySpike,
  calendarWeeks,
  computeKpis,
  currentBalance,
  equityCurve,
  type BreakdownTrade,
  type DailyMetrics,
} from "./metrics";

function day(date: string, pnl: number, partial: Partial<DailyMetrics> = {}): DailyMetrics {
  return {
    date,
    trades: 1,
    wins: pnl > 0 ? 1 : 0,
    losses: pnl < 0 ? 1 : 0,
    pnl,
    gross_profit: Math.max(pnl, 0),
    gross_loss: Math.max(-pnl, 0),
    r_sum: pnl,
    with_spike_trades: 1,
    compliance_pct: 100,
    max_drawdown: 0,
    ...partial,
  };
}

describe("computeKpis", () => {
  it("calcula neto, win rate, profit factor y esperanza en R", () => {
    const k = computeKpis([
      day("2026-10-01", 4, { trades: 3, wins: 2, losses: 1, gross_profit: 5, gross_loss: 1, r_sum: 3 }),
      day("2026-10-02", -2, { trades: 2, wins: 0, losses: 2, gross_profit: 0, gross_loss: 2, r_sum: -2 }),
    ]);
    expect(k.trades).toBe(5);
    expect(k.net).toBe(2);
    expect(k.winRate).toBeCloseTo(2 / 5);
    expect(k.profitFactor).toBeCloseTo(5 / 3);
    expect(k.expectancyR).toBeCloseTo(0.2);
  });

  it("sin datos devuelve nulos", () => {
    const k = computeKpis([]);
    expect(k).toEqual({ trades: 0, net: 0, winRate: null, profitFactor: null, expectancyR: null });
  });

  it("los empates no cuentan para el win rate", () => {
    const k = computeKpis([day("2026-10-01", 2, { trades: 2, wins: 1, losses: 0, r_sum: 2 })]);
    expect(k.winRate).toBe(1);
    expect(k.profitFactor).toBe(Infinity);
  });
});

describe("equityCurve", () => {
  const rows = [
    day("2026-09-28", 10),
    day("2026-10-01", 5),
    day("2026-10-02", -8),
    day("2026-10-05", 2),
    day("2026-11-01", 100),
  ];

  it("arranca con el balance del cierre del mes anterior y suma las operaciones", () => {
    const pts = equityCurve(100, rows, "2026-10");
    expect(pts.map((p) => p.equity)).toEqual([110, 115, 107, 109]);
    expect(pts[0].date).toBe("2026-09-30");
    // El último punto cuadra con inicial + suma de todos los días hasta fin de mes.
    expect(pts.at(-1)?.equity).toBe(100 + 10 + 5 - 8 + 2);
  });

  it("el drawdown mide la distancia al pico", () => {
    const pts = equityCurve(100, rows, "2026-10");
    expect(pts.map((p) => p.drawdown)).toEqual([0, 0, -8, -6]);
  });

  it("el pico se arrastra desde antes del mes", () => {
    const pts = equityCurve(100, [day("2026-09-01", 50), day("2026-09-02", -20), day("2026-10-01", 5)], "2026-10");
    expect(pts[0].drawdown).toBe(-20);
    expect(pts[1].drawdown).toBe(-15);
  });

  it("currentBalance suma todo", () => {
    expect(currentBalance(100, rows)).toBe(209);
  });
});

describe("calendarWeeks", () => {
  it("arma seis semanas de lunes a domingo con resumen semanal", () => {
    // Octubre 2026 empieza en jueves.
    const weeks = calendarWeeks("2026-10", [day("2026-10-01", 5), day("2026-10-02", -2), day("2026-10-05", 3)]);
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.cells.length === 7)).toBe(true);
    expect(weeks[0].cells[0].date).toBe("2026-09-28");
    expect(weeks[0].cells[0].inMonth).toBe(false);
    expect(weeks[0].cells[3].date).toBe("2026-10-01");
    expect(weeks[0].summary.pnl).toBe(3);
    expect(weeks[0].summary.trades).toBe(2);
    expect(weeks[1].summary.pnl).toBe(3);
  });

  it("ignora días fuera del mes aunque haya datos", () => {
    const weeks = calendarWeeks("2026-10", [day("2026-09-29", 50)]);
    expect(weeks[0].summary.pnl).toBe(0);
  });
});

describe("desgloses", () => {
  const t = (partial: Partial<BreakdownTrade>): BreakdownTrade => ({
    instrument: "BOOM500",
    with_spike: true,
    opened_at: "2026-10-20T13:10:00Z",
    pnl: 2,
    r_multiple: 2,
    outcome: "win",
    ...partial,
  });

  const trades = [
    t({}),
    t({ pnl: -1, r_multiple: -1, outcome: "loss" }),
    t({ instrument: "CRASH300", with_spike: false, pnl: -1, r_multiple: -1, outcome: "loss", opened_at: "2026-10-20T15:30:00Z" }),
    t({ instrument: "CRASH300", with_spike: true, opened_at: "2026-10-20T15:45:00Z" }),
  ];

  it("por índice en el orden del catálogo", () => {
    const b = byInstrument(trades);
    expect(b.map((x) => x.key)).toEqual(["BOOM500", "CRASH300"]);
    expect(b[0].winRate).toBe(0.5);
    expect(b[0].r).toBe(1);
  });

  it("a favor vs contra el spike cuadra con el total", () => {
    const s = bySpike(trades);
    expect(s.with.trades + s.against.trades).toBe(trades.length);
    expect(s.with.r).toBe(3);
    expect(s.against.r).toBe(-1);
  });

  it("por hora de La Paz", () => {
    const h = byHour(trades);
    expect(h.map((x) => x.label)).toEqual(["09:00", "11:00"]);
    expect(h[0].pnl).toBe(1);
    expect(h[1].pnl).toBe(1);
  });
});
