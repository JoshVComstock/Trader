import { describe, expect, it } from "vitest";
import { computeDayMetrics, type DailyTrade } from "./daily";

const t = (id: string, minute: number, pnl: number, extra: Partial<DailyTrade> = {}): DailyTrade => ({
  id,
  opened_at: `2026-10-20T13:${String(minute).padStart(2, "0")}:00.000Z`,
  outcome: pnl > 0 ? "win" : pnl < 0 ? "loss" : "tie",
  pnl,
  r_multiple: pnl,
  with_spike: true,
  violated: false,
  ...extra,
});

describe("computeDayMetrics", () => {
  it("devuelve null sin operaciones", () => {
    expect(computeDayMetrics([])).toBeNull();
  });

  it("suma ganancias, pérdidas y R", () => {
    const m = computeDayMetrics([t("a", 1, 2), t("b", 2, -1), t("c", 3, 0)])!;
    expect(m).toMatchObject({ trades: 3, wins: 1, losses: 1, pnl: 1, gross_profit: 2, gross_loss: 1, r_sum: 1 });
  });

  it("calcula el drawdown desde el pico del día, en orden de apertura", () => {
    // Llega a +3, baja a 0 y termina en +1: el peor tramo fue 3.
    const m = computeDayMetrics([t("c", 3, -2), t("a", 1, 3), t("b", 2, -1), t("d", 4, 1)])!;
    expect(m.max_drawdown).toBe(3);
  });

  it("el cumplimiento es el porcentaje de operaciones sin reglas rotas", () => {
    const m = computeDayMetrics([t("a", 1, 1), t("b", 2, -1, { violated: true }), t("c", 3, 1, { with_spike: false })])!;
    expect(m.compliance_pct).toBe(66.67);
    expect(m.with_spike_trades).toBe(2);
  });
});
