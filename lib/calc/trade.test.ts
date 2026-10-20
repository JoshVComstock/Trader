import { describe, expect, it } from "vitest";
import { defaultChecklist } from "../domain/checklist";
import { defaultPnl, deriveTrade, isWithSpike, outcomeFromPnl, rMultiple } from "./trade";

describe("rMultiple", () => {
  it("es pnl / stake", () => {
    expect(rMultiple(2, 1)).toBe(2);
    expect(rMultiple(-1, 1)).toBe(-1);
    expect(rMultiple(1.5, 3)).toBe(0.5);
    expect(rMultiple(0, 5)).toBe(0);
  });

  it("redondea a cuatro decimales", () => {
    expect(rMultiple(1, 3)).toBe(0.3333);
  });

  it("rechaza stake cero o negativo", () => {
    expect(() => rMultiple(1, 0)).toThrow();
    expect(() => rMultiple(1, -1)).toThrow();
  });
});

describe("outcomeFromPnl", () => {
  it("clasifica por signo", () => {
    expect(outcomeFromPnl(0.01)).toBe("win");
    expect(outcomeFromPnl(-0.01)).toBe("loss");
    expect(outcomeFromPnl(0)).toBe("tie");
  });
});

describe("isWithSpike", () => {
  it("en Boom comprar es a favor y vender es en contra", () => {
    expect(isWithSpike("BOOM500", "buy")).toBe(true);
    expect(isWithSpike("BOOM1000", "sell")).toBe(false);
  });

  it("en Crash vender es a favor y comprar es en contra", () => {
    expect(isWithSpike("CRASH300", "sell")).toBe(true);
    expect(isWithSpike("CRASH900", "buy")).toBe(false);
  });

  it("falla con un instrumento desconocido", () => {
    expect(() => isWithSpike("EURUSD", "buy")).toThrow();
  });
});

describe("defaultPnl", () => {
  it("ganada cobra el TP; sin TP asume 2R", () => {
    expect(defaultPnl("win", 1, 2.5)).toBe(2.5);
    expect(defaultPnl("win", 1, null)).toBe(2);
  });

  it("perdida pierde el stake y empate es cero", () => {
    expect(defaultPnl("loss", 1.5, 3)).toBe(-1.5);
    expect(defaultPnl("tie", 1, 2)).toBe(0);
  });
});

describe("deriveTrade", () => {
  it("deriva todo lo que no se le pregunta al usuario", () => {
    const d = deriveTrade({
      instrument: "CRASH500",
      direction: "sell",
      stake: 1,
      pnl: 2,
      checklist: defaultChecklist(),
    });
    expect(d).toEqual({ with_spike: true, r_multiple: 2, outcome: "win", moved_sl: false, in_plan: true });
  });

  it("impulso o SL movido sacan la operación del plan", () => {
    const c = { ...defaultChecklist(), impulse: true, kept_sl: false };
    const d = deriveTrade({ instrument: "BOOM300", direction: "sell", stake: 2, pnl: -2, checklist: c });
    expect(d.in_plan).toBe(false);
    expect(d.moved_sl).toBe(true);
    expect(d.with_spike).toBe(false);
    expect(d.outcome).toBe("loss");
    expect(d.r_multiple).toBe(-1);
  });
});
