import { describe, expect, it } from "vitest";
import { evaluateTrade } from "./engine";
import { goalMet, goalProgress } from "./goal";
import type { EngineInput, EngineTrade, Rule } from "./types";

const T0 = "2026-10-22T13:00:00.000Z";
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();
const t = (min: number, pnl: number): EngineTrade => ({ opened_at: at(min), closed_at: null, stake: 1, pnl, impulse: false });

const goalRule: Rule = { type: "daily_goal", params: {}, action: "block", enabled: true };
const protect: Rule = { type: "protect_profit", params: { pct: 50 }, action: "block", enabled: true };

function input(partial: Partial<EngineInput>): EngineInput {
  return { candidate: t(30, 1), sessionTrades: [], sessionOpenedAt: T0, balance: 100, rules: [goalRule, protect], goalAmount: 3, ...partial };
}

describe("daily_goal", () => {
  it("una antes de la meta: nada", () => {
    const r = evaluateTrade(input({ sessionTrades: [t(0, 1)], candidate: t(10, 1) }));
    expect(r.limits).toHaveLength(0);
  });

  it("exactamente en la meta: llega y bloquea", () => {
    const r = evaluateTrade(input({ sessionTrades: [t(0, 2)], candidate: t(10, 1) }));
    expect(r.limits.map((l) => l.ruleType)).toEqual(["daily_goal"]);
    expect(r.limits[0].message).toContain("Llegaste a tu objetivo");
    expect(r.shouldBlock).toBe(true);
  });

  it("pasarse de la meta de un salto también cuenta", () => {
    const r = evaluateTrade(input({ candidate: t(10, 5) }));
    expect(r.limits[0].ruleType).toBe("daily_goal");
  });

  it("si ya estabas sobre la meta (regla en aviso), no vuelve a avisar", () => {
    const r = evaluateTrade(input({ rules: [{ ...goalRule, action: "warn" }], sessionTrades: [t(0, 4)], candidate: t(10, 1) }));
    expect(r.limits).toHaveLength(0);
  });

  it("sin meta en el check-in no hace nada", () => {
    const r = evaluateTrade(input({ goalAmount: null, candidate: t(10, 10) }));
    expect(r.limits).toHaveLength(0);
  });
});

describe("protect_profit", () => {
  const rules = [{ ...goalRule, action: "warn" as const }, protect];

  it("antes de llegar a la meta no protege nada", () => {
    const r = evaluateTrade(input({ rules, sessionTrades: [t(0, 2)], candidate: t(10, -1.5) }));
    expect(r.limits).toHaveLength(0);
  });

  it("tras llegar, devolver justo la mitad para", () => {
    // pico 4, piso 2: de 4 a 2.
    const r = evaluateTrade(input({ rules, sessionTrades: [t(0, 4)], candidate: t(10, -2) }));
    expect(r.limits.map((l) => l.ruleType)).toEqual(["protect_profit"]);
    expect(r.shouldBlock).toBe(true);
  });

  it("devolver un poco menos de la mitad todavía no", () => {
    const r = evaluateTrade(input({ rules, sessionTrades: [t(0, 4)], candidate: t(10, -1.99) }));
    expect(r.limits).toHaveLength(0);
  });

  it("una ganancia nueva nunca dispara la protección", () => {
    const r = evaluateTrade(input({ rules, sessionTrades: [t(0, 4)], candidate: t(10, 1) }));
    expect(r.limits).toHaveLength(0);
  });
});

describe("goalProgress", () => {
  it("mide el neto, el pico y el piso de protección", () => {
    const g = goalProgress({ sessionTrades: [t(0, 2), t(5, 2), t(10, -1)], goalAmount: 3, rules: [protect] })!;
    expect(g).toMatchObject({ goal: 3, net: 3, peak: 4, reached: true, protectFloor: 2, gaveBack: false });
  });

  it("sin llegar no hay piso", () => {
    const g = goalProgress({ sessionTrades: [t(0, 1)], goalAmount: 3, rules: [protect] })!;
    expect(g.reached).toBe(false);
    expect(g.protectFloor).toBeNull();
    expect(g.ratio).toBeCloseTo(1 / 3);
  });

  it("sin meta devuelve null", () => {
    expect(goalProgress({ sessionTrades: [], goalAmount: null, rules: [] })).toBeNull();
  });

  it("goalMet", () => {
    expect(goalMet(3, 3)).toBe(true);
    expect(goalMet(2.99, 3)).toBe(false);
    expect(goalMet(5, null)).toBeNull();
  });
});
