import { formatHHMM, localMinuteOfDay, parseHHMM } from "../time-core";
import type {
  EngineInput,
  EngineResult,
  EngineTrade,
  LimitReached,
  Rule,
  RuleOf,
  Violation,
} from "./types";

const money = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const pct = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 });

const STOP = "lo decidiste tú cuando estabas tranquilo.";

function ms(iso: string): number {
  return Date.parse(iso);
}

function byOpenedAt(a: EngineTrade, b: EngineTrade): number {
  return ms(a.opened_at) - ms(b.opened_at);
}

/** La operación inmediatamente anterior a la candidata dentro de la sesión. */
function previousTrade(input: EngineInput): EngineTrade | undefined {
  const t = ms(input.candidate.opened_at);
  const before = input.sessionTrades.filter((x) => ms(x.opened_at) <= t);
  before.sort(byOpenedAt);
  return before.at(-1);
}

type Check<T extends Rule["type"]> = (
  rule: RuleOf<T>,
  input: EngineInput,
) => { violation?: string; limit?: string };

/** Límites de conteo: llegar al tope cierra el día; pasarlo es una violación. */
function counter(
  count: number,
  n: number,
  limitMsg: string,
  overMsg: string,
): { violation?: string; limit?: string } {
  if (count > n) return { violation: overMsg };
  if (count === n) return { limit: limitMsg };
  return {};
}

const checks: { [T in Rule["type"]]: Check<T> } = {
  max_trades(rule, input) {
    const n = rule.params.n;
    const count = input.sessionTrades.length + 1;
    return counter(
      count,
      n,
      `Llegaste a tus ${n} operativas. Se acabó el día — ${STOP}`,
      `Esta es la operativa ${count} y tu límite es ${n}.`,
    );
  },

  max_losses(rule, input) {
    if (input.candidate.pnl >= 0) return {};
    const n = rule.params.n;
    const count = input.sessionTrades.filter((t) => t.pnl < 0).length + 1;
    return counter(
      count,
      n,
      `Llevas ${n} ${n === 1 ? "pérdida" : "pérdidas"}. Tu regla dice que aquí paras — ${STOP}`,
      `Pérdida número ${count} con un límite de ${n}.`,
    );
  },

  max_psych_errors(rule, input) {
    if (!input.candidate.impulse) return {};
    const n = rule.params.n;
    const count = input.sessionTrades.filter((t) => t.impulse).length + 1;
    return counter(
      count,
      n,
      `Van ${n} ${n === 1 ? "entrada" : "entradas"} por impulso. Hoy ya no estás operando tu plan — ${STOP}`,
      `Entrada por impulso número ${count} con un límite de ${n}.`,
    );
  },

  max_session_minutes(rule, input) {
    const elapsed = (ms(input.candidate.opened_at) - ms(input.sessionOpenedAt)) / 60_000;
    if (elapsed > rule.params.minutes) {
      return {
        violation: `Entraste al minuto ${Math.floor(elapsed)} de una sesión de ${rule.params.minutes}.`,
      };
    }
    return {};
  },

  max_risk_pct(rule, input) {
    if (!(input.balance > 0)) return {};
    const risk = (input.candidate.stake / input.balance) * 100;
    // Tolerancia de redondeo: 2 % de 100 tiene que ser exactamente 2.
    if (risk > rule.params.pct + 1e-9) {
      return {
        violation: `Arriesgaste el ${pct.format(risk)} % de la cuenta y tu tope es ${pct.format(rule.params.pct)} %.`,
      };
    }
    return {};
  },

  allowed_hours(rule, input) {
    const from = parseHHMM(rule.params.from);
    const to = parseHHMM(rule.params.to);
    const at = localMinuteOfDay(input.candidate.opened_at);
    // [from, to): a la hora de cierre ya estás fuera. Soporta franjas que cruzan medianoche.
    const inside = from <= to ? at >= from && at < to : at >= from || at < to;
    if (!inside) {
      return {
        violation: `Entraste a las ${formatHHMM(at)}, fuera de tu horario (${rule.params.from}–${rule.params.to}).`,
      };
    }
    return {};
  },

  no_size_increase_after_loss(rule, input) {
    const prev = previousTrade(input);
    if (!prev || prev.pnl >= 0) return {};
    const limit = prev.stake * rule.params.factor;
    if (input.candidate.stake > limit + 1e-9) {
      return {
        violation: `Subiste el riesgo de ${money.format(prev.stake)} a ${money.format(input.candidate.stake)} justo después de perder.`,
      };
    }
    return {};
  },

  min_gap_seconds(rule, input) {
    const prev = previousTrade(input);
    if (!prev) return {};
    const reference = prev.closed_at ?? prev.opened_at;
    const gap = (ms(input.candidate.opened_at) - ms(reference)) / 1000;
    if (gap < rule.params.seconds) {
      return {
        violation: `Volviste a entrar ${Math.max(0, Math.round(gap))} s después de la anterior. Tu pausa mínima es ${rule.params.seconds} s.`,
      };
    }
    return {};
  },
};

/**
 * Evalúa una operación candidata contra las reglas activas.
 * Módulo puro: corre igual en el navegador (aviso) y en el servidor (verdad).
 */
export function evaluateTrade(input: EngineInput): EngineResult {
  const violations: Violation[] = [];
  const limits: LimitReached[] = [];

  for (const rule of input.rules) {
    if (!rule.enabled) continue;
    const check = checks[rule.type] as Check<typeof rule.type>;
    const result = check(rule, input);
    if (result.violation) {
      violations.push({ ruleType: rule.type, action: rule.action, message: result.violation });
    }
    if (result.limit) {
      limits.push({ ruleType: rule.type, action: rule.action, message: result.limit });
    }
  }

  const shouldBlock =
    violations.some((v) => v.action === "block") || limits.some((l) => l.action === "block");

  return { violations, limits, shouldBlock };
}
