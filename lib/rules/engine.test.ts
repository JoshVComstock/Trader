import { describe, expect, it } from "vitest";
import { evaluateTrade } from "./engine";
import type { EngineInput, EngineTrade, Rule } from "./types";

// 09:00 en La Paz = 13:00 UTC.
const T0 = "2026-10-20T13:00:00.000Z";

function at(minutes: number, seconds = 0): string {
  return new Date(Date.parse(T0) + minutes * 60_000 + seconds * 1000).toISOString();
}

function trade(partial: Partial<EngineTrade> = {}): EngineTrade {
  return {
    opened_at: T0,
    closed_at: null,
    stake: 1,
    pnl: 2,
    impulse: false,
    ...partial,
  };
}

function input(rule: Rule, partial: Partial<EngineInput> = {}): EngineInput {
  return {
    candidate: trade(),
    sessionTrades: [],
    sessionOpenedAt: T0,
    balance: 100,
    rules: [rule],
    ...partial,
  };
}

const losses = (n: number) => Array.from({ length: n }, (_, i) => trade({ pnl: -1, opened_at: at(i) }));

describe("max_trades", () => {
  const rule: Rule = { type: "max_trades", params: { n: 3 }, action: "block", enabled: true };

  it("una antes del límite: nada", () => {
    const r = evaluateTrade(input(rule, { sessionTrades: [trade()] }));
    expect(r.violations).toHaveLength(0);
    expect(r.limits).toHaveLength(0);
    expect(r.shouldBlock).toBe(false);
  });

  it("exactamente en el límite: se guarda y bloquea la sesión", () => {
    const r = evaluateTrade(input(rule, { sessionTrades: [trade(), trade()] }));
    expect(r.violations).toHaveLength(0);
    expect(r.limits).toHaveLength(1);
    expect(r.limits[0].message).toContain("Llegaste a tus 3 operativas");
    expect(r.shouldBlock).toBe(true);
  });

  it("una después del límite: violación", () => {
    const r = evaluateTrade(input(rule, { sessionTrades: [trade(), trade(), trade()] }));
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].ruleType).toBe("max_trades");
    expect(r.shouldBlock).toBe(true);
  });

  it("con acción warn avisa pero no bloquea", () => {
    const r = evaluateTrade(
      input({ ...rule, action: "warn" }, { sessionTrades: [trade(), trade(), trade()] }),
    );
    expect(r.violations).toHaveLength(1);
    expect(r.shouldBlock).toBe(false);
  });

  it("una regla desactivada no hace nada", () => {
    const r = evaluateTrade(input({ ...rule, enabled: false }, { sessionTrades: losses(5) }));
    expect(r.violations).toHaveLength(0);
    expect(r.limits).toHaveLength(0);
  });
});

describe("max_losses", () => {
  const rule: Rule = { type: "max_losses", params: { n: 2 }, action: "block", enabled: true };
  const loss = trade({ pnl: -1, opened_at: at(10) });

  it("una antes: primera pérdida", () => {
    const r = evaluateTrade(input(rule, { candidate: loss }));
    expect(r.limits).toHaveLength(0);
    expect(r.shouldBlock).toBe(false);
  });

  it("exactamente en el límite: segunda pérdida bloquea", () => {
    const r = evaluateTrade(input(rule, { candidate: loss, sessionTrades: losses(1) }));
    expect(r.violations).toHaveLength(0);
    expect(r.limits).toHaveLength(1);
    expect(r.shouldBlock).toBe(true);
  });

  it("una después: tercera pérdida es violación", () => {
    const r = evaluateTrade(input(rule, { candidate: loss, sessionTrades: losses(2) }));
    expect(r.violations).toHaveLength(1);
  });

  it("una ganada no cuenta aunque ya haya pérdidas", () => {
    const r = evaluateTrade(input(rule, { sessionTrades: losses(2) }));
    expect(r.violations).toHaveLength(0);
    expect(r.limits).toHaveLength(0);
  });
});

describe("max_psych_errors", () => {
  const rule: Rule = { type: "max_psych_errors", params: { n: 2 }, action: "block", enabled: true };
  const impulsive = (n: number) => Array.from({ length: n }, () => trade({ impulse: true }));
  const candidate = trade({ impulse: true });

  it("una antes", () => {
    expect(evaluateTrade(input(rule, { candidate })).shouldBlock).toBe(false);
  });

  it("exactamente en el límite", () => {
    const r = evaluateTrade(input(rule, { candidate, sessionTrades: impulsive(1) }));
    expect(r.limits).toHaveLength(1);
    expect(r.shouldBlock).toBe(true);
  });

  it("una después", () => {
    const r = evaluateTrade(input(rule, { candidate, sessionTrades: impulsive(2) }));
    expect(r.violations).toHaveLength(1);
  });

  it("una operación sin impulso no suma", () => {
    const r = evaluateTrade(input(rule, { sessionTrades: impulsive(2) }));
    expect(r.violations).toHaveLength(0);
    expect(r.limits).toHaveLength(0);
  });
});

describe("max_session_minutes", () => {
  const rule: Rule = { type: "max_session_minutes", params: { minutes: 60 }, action: "warn", enabled: true };

  it("un minuto antes", () => {
    expect(evaluateTrade(input(rule, { candidate: trade({ opened_at: at(59) }) })).violations).toHaveLength(0);
  });

  it("exactamente en el minuto 60", () => {
    expect(evaluateTrade(input(rule, { candidate: trade({ opened_at: at(60) }) })).violations).toHaveLength(0);
  });

  it("un minuto después", () => {
    const r = evaluateTrade(input(rule, { candidate: trade({ opened_at: at(61) }) }));
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].message).toContain("minuto 61");
    expect(r.shouldBlock).toBe(false);
  });
});

describe("max_risk_pct", () => {
  const rule: Rule = { type: "max_risk_pct", params: { pct: 2 }, action: "block", enabled: true };

  it("uno antes: 1,99 %", () => {
    expect(evaluateTrade(input(rule, { candidate: trade({ stake: 1.99 }) })).violations).toHaveLength(0);
  });

  it("exactamente 2 %", () => {
    expect(evaluateTrade(input(rule, { candidate: trade({ stake: 2 }) })).violations).toHaveLength(0);
  });

  it("uno después: 2,01 %", () => {
    const r = evaluateTrade(input(rule, { candidate: trade({ stake: 2.01 }) }));
    expect(r.violations).toHaveLength(1);
    expect(r.shouldBlock).toBe(true);
  });

  it("calcula sobre el balance, no sobre el inicial", () => {
    const r = evaluateTrade(input(rule, { balance: 250, candidate: trade({ stake: 5 }) }));
    expect(r.violations).toHaveLength(0);
  });
});

describe("allowed_hours", () => {
  const rule: Rule = {
    type: "allowed_hours",
    params: { from: "08:00", to: "11:00" },
    action: "warn",
    enabled: true,
  };
  // 08:00 La Paz = 12:00 UTC
  const local = (hh: number, mm: number) =>
    new Date(Date.UTC(2026, 9, 20, hh + 4, mm)).toISOString();

  it("un minuto antes de abrir", () => {
    const r = evaluateTrade(input(rule, { candidate: trade({ opened_at: local(7, 59) }) }));
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].message).toContain("07:59");
  });

  it("exactamente a la hora de apertura", () => {
    expect(evaluateTrade(input(rule, { candidate: trade({ opened_at: local(8, 0) }) })).violations).toHaveLength(0);
  });

  it("un minuto antes de cerrar", () => {
    expect(evaluateTrade(input(rule, { candidate: trade({ opened_at: local(10, 59) }) })).violations).toHaveLength(0);
  });

  it("exactamente a la hora de cierre ya está fuera", () => {
    expect(evaluateTrade(input(rule, { candidate: trade({ opened_at: local(11, 0) }) })).violations).toHaveLength(1);
  });

  it("franja que cruza medianoche", () => {
    const night: Rule = { ...rule, params: { from: "22:00", to: "02:00" } };
    expect(evaluateTrade(input(night, { candidate: trade({ opened_at: local(23, 0) }) })).violations).toHaveLength(0);
    expect(evaluateTrade(input(night, { candidate: trade({ opened_at: local(3, 0) }) })).violations).toHaveLength(1);
  });
});

describe("no_size_increase_after_loss", () => {
  const rule: Rule = {
    type: "no_size_increase_after_loss",
    params: { factor: 1.5 },
    action: "block",
    enabled: true,
  };
  const prevLoss = [trade({ stake: 2, pnl: -2, opened_at: at(0) })];

  it("uno antes del factor", () => {
    const r = evaluateTrade(input(rule, { sessionTrades: prevLoss, candidate: trade({ stake: 2.99, opened_at: at(5) }) }));
    expect(r.violations).toHaveLength(0);
  });

  it("exactamente el factor", () => {
    const r = evaluateTrade(input(rule, { sessionTrades: prevLoss, candidate: trade({ stake: 3, opened_at: at(5) }) }));
    expect(r.violations).toHaveLength(0);
  });

  it("uno después del factor", () => {
    const r = evaluateTrade(input(rule, { sessionTrades: prevLoss, candidate: trade({ stake: 3.01, opened_at: at(5) }) }));
    expect(r.violations).toHaveLength(1);
    expect(r.shouldBlock).toBe(true);
  });

  it("si la anterior ganó, subir no es violación", () => {
    const prevWin = [trade({ stake: 2, pnl: 4, opened_at: at(0) })];
    const r = evaluateTrade(input(rule, { sessionTrades: prevWin, candidate: trade({ stake: 10, opened_at: at(5) }) }));
    expect(r.violations).toHaveLength(0);
  });

  it("mira la anterior en el tiempo, no la última de la lista", () => {
    const list = [trade({ stake: 2, pnl: -2, opened_at: at(10) }), trade({ stake: 2, pnl: 4, opened_at: at(0) })];
    const r = evaluateTrade(input(rule, { sessionTrades: list, candidate: trade({ stake: 5, opened_at: at(20) }) }));
    expect(r.violations).toHaveLength(1);
  });
});

describe("min_gap_seconds", () => {
  const rule: Rule = { type: "min_gap_seconds", params: { seconds: 180 }, action: "warn", enabled: true };
  const prev = [trade({ opened_at: at(0), closed_at: at(2) })];

  it("un segundo antes de la pausa mínima", () => {
    const r = evaluateTrade(input(rule, { sessionTrades: prev, candidate: trade({ opened_at: at(5, -1) }) }));
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].message).toContain("179 s");
  });

  it("exactamente la pausa mínima", () => {
    const r = evaluateTrade(input(rule, { sessionTrades: prev, candidate: trade({ opened_at: at(5) }) }));
    expect(r.violations).toHaveLength(0);
  });

  it("un segundo después", () => {
    const r = evaluateTrade(input(rule, { sessionTrades: prev, candidate: trade({ opened_at: at(5, 1) }) }));
    expect(r.violations).toHaveLength(0);
  });

  it("sin cierre registrado mide desde la apertura", () => {
    const open = [trade({ opened_at: at(0) })];
    const r = evaluateTrade(input(rule, { sessionTrades: open, candidate: trade({ opened_at: at(2) }) }));
    expect(r.violations).toHaveLength(1);
  });

  it("la primera operación nunca rompe la pausa", () => {
    expect(evaluateTrade(input(rule)).violations).toHaveLength(0);
  });
});

describe("varias reglas a la vez", () => {
  it("acumula violaciones y bloquea si alguna es block", () => {
    const rules: Rule[] = [
      { type: "max_risk_pct", params: { pct: 2 }, action: "warn", enabled: true },
      { type: "min_gap_seconds", params: { seconds: 180 }, action: "block", enabled: true },
    ];
    const r = evaluateTrade({
      candidate: trade({ stake: 5, opened_at: at(1) }),
      sessionTrades: [trade({ opened_at: at(0) })],
      sessionOpenedAt: T0,
      balance: 100,
      rules,
    });
    expect(r.violations.map((v) => v.ruleType).sort()).toEqual(["max_risk_pct", "min_gap_seconds"]);
    expect(r.shouldBlock).toBe(true);
  });
});
