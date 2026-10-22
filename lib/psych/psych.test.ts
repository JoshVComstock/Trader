import { describe, expect, it } from "vitest";
import type { Rule } from "../rules/types";
import { detectTilt, disciplineStreak, isSunday, pauseState, weekStart, type TiltTrade } from "./index";

const T0 = "2026-10-21T13:00:00.000Z";
const at = (sec: number) => new Date(Date.parse(T0) + sec * 1000).toISOString();
const gap: Rule = { type: "min_gap_seconds", params: { seconds: 180 }, action: "warn", enabled: true };

describe("pauseState", () => {
  const loss = [{ opened_at: T0, closed_at: at(60), pnl: -1 }];

  it("pausa tras una pérdida, contada desde el cierre", () => {
    const p = pauseState(loss, [gap], at(120));
    expect(p.active).toBe(true);
    expect(p.remainingSec).toBe(120);
    expect(p.totalSec).toBe(180);
  });

  it("un segundo antes de terminar sigue activa; al terminar se libera", () => {
    expect(pauseState(loss, [gap], at(239)).active).toBe(true);
    expect(pauseState(loss, [gap], at(240)).active).toBe(false);
  });

  it("sin cierre mide desde la apertura", () => {
    const p = pauseState([{ opened_at: T0, closed_at: null, pnl: -1 }], [gap], at(30));
    expect(p.remainingSec).toBe(150);
  });

  it("una ganada no pausa", () => {
    expect(pauseState([{ opened_at: T0, closed_at: at(60), pnl: 2 }], [gap], at(61)).active).toBe(false);
  });

  it("mira la última en el tiempo", () => {
    const list = [
      { opened_at: at(100), closed_at: at(120), pnl: 2 },
      { opened_at: T0, closed_at: at(60), pnl: -1 },
    ];
    expect(pauseState(list, [gap], at(130)).active).toBe(false);
  });

  it("sin la regla de pausa mínima activa no hay pausa", () => {
    expect(pauseState(loss, [{ ...gap, enabled: false }], at(61)).active).toBe(false);
    expect(pauseState(loss, [], at(61)).active).toBe(false);
  });
});

describe("detectTilt", () => {
  const t = (p: Partial<TiltTrade>): TiltTrade => ({ opened_at: T0, stake: 1, pnl: 2, with_spike: true, ...p });
  const prevLoss = [t({ pnl: -1, stake: 1 })];

  it("las tres señales juntas son tilt", () => {
    const r = detectTilt(t({ opened_at: at(240), stake: 2, with_spike: false }), prevLoss);
    expect(r.level).toBe("tilt");
    expect(r.signals).toEqual(["loss", "bigger_stake", "against_spike"]);
    expect(r.message).toContain("tilt");
  });

  it("pérdida + una señal es riesgo", () => {
    expect(detectTilt(t({ opened_at: at(240), stake: 2 }), prevLoss).level).toBe("risk");
    expect(detectTilt(t({ opened_at: at(240), with_spike: false }), prevLoss).level).toBe("risk");
  });

  it("sin pérdida reciente no hay tilt aunque vaya contra el spike con más stake", () => {
    const r = detectTilt(t({ opened_at: at(240), stake: 5, with_spike: false }), [t({ pnl: 2 })]);
    expect(r.level).toBe("none");
  });

  it("la ventana es de 10 minutos", () => {
    const candidate = t({ stake: 2, with_spike: false });
    expect(detectTilt({ ...candidate, opened_at: at(600) }, prevLoss).level).toBe("tilt");
    expect(detectTilt({ ...candidate, opened_at: at(601) }, prevLoss).level).toBe("none");
  });

  it("solo pérdida, mismo stake y a favor: nada", () => {
    expect(detectTilt(t({ opened_at: at(240) }), prevLoss).level).toBe("none");
  });
});

describe("disciplineStreak", () => {
  const d = (date: string, c: number) => ({ date, compliance_pct: c });

  it("cuenta los días operados seguidos sin violaciones hasta el último", () => {
    const s = disciplineStreak([d("2026-10-01", 100), d("2026-10-02", 50), d("2026-10-05", 100), d("2026-10-06", 100)]);
    expect(s).toEqual({ current: 2, best: 2, brokenOnLast: false });
  });

  it("guarda la mejor racha aunque la actual se haya cortado", () => {
    const s = disciplineStreak([d("2026-10-01", 100), d("2026-10-02", 100), d("2026-10-03", 100), d("2026-10-06", 80)]);
    expect(s).toEqual({ current: 0, best: 3, brokenOnLast: true });
  });

  it("ordena por fecha antes de contar", () => {
    expect(disciplineStreak([d("2026-10-03", 100), d("2026-10-01", 0), d("2026-10-02", 100)]).current).toBe(2);
  });

  it("sin días no hay racha", () => {
    expect(disciplineStreak([])).toEqual({ current: 0, best: 0, brokenOnLast: false });
  });
});

describe("semanas", () => {
  it("weekStart devuelve el lunes", () => {
    expect(weekStart("2026-10-21")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
  });

  it("isSunday", () => {
    expect(isSunday("2026-10-25")).toBe(true);
    expect(isSunday("2026-10-24")).toBe(false);
  });
});
