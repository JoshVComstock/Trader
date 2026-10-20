import { describe, expect, it } from "vitest";
import { computeMeters } from "./meters";
import type { EngineTrade, Rule } from "./types";

const rules: Rule[] = [
  { type: "max_trades", params: { n: 3 }, action: "block", enabled: true },
  { type: "max_losses", params: { n: 2 }, action: "block", enabled: true },
  { type: "max_psych_errors", params: { n: 2 }, action: "block", enabled: true },
  { type: "max_session_minutes", params: { minutes: 60 }, action: "warn", enabled: true },
];

const t = (pnl: number, impulse = false): EngineTrade => ({
  opened_at: "2026-10-20T13:00:00Z",
  closed_at: null,
  stake: 1,
  pnl,
  impulse,
});

describe("computeMeters", () => {
  it("cuenta operativas, pérdidas, errores y minutos", () => {
    const m = computeMeters({
      sessionTrades: [t(2), t(-1, true)],
      sessionOpenedAt: "2026-10-20T13:00:00Z",
      now: "2026-10-20T13:41:30Z",
      rules,
    });
    expect(m.map((x) => [x.key, x.value, x.limit, x.level])).toEqual([
      ["trades", 2, 3, "near"],
      ["losses", 1, 2, "near"],
      ["psych", 1, 2, "near"],
      ["minutes", 41, 60, "ok"],
    ]);
  });

  it("marca en rojo al llegar al límite", () => {
    const m = computeMeters({
      sessionTrades: [t(-1), t(-1), t(2)],
      sessionOpenedAt: "2026-10-20T13:00:00Z",
      now: "2026-10-20T14:00:00Z",
      rules,
    });
    expect(m.find((x) => x.key === "trades")?.level).toBe("hit");
    expect(m.find((x) => x.key === "losses")?.level).toBe("hit");
    expect(m.find((x) => x.key === "minutes")?.level).toBe("hit");
  });

  it("sin regla activa no hay límite", () => {
    const m = computeMeters({
      sessionTrades: [t(2)],
      sessionOpenedAt: "2026-10-20T13:00:00Z",
      now: "2026-10-20T13:00:00Z",
      rules: [],
    });
    expect(m.every((x) => x.limit === null && x.level === "ok")).toBe(true);
  });
});
