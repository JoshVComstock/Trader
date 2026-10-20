import { hasMovedSl, isInPlan, type Checklist } from "../domain/checklist";
import { getInstrument } from "../domain/instruments";
import type { Direction, Outcome } from "../domain/types";

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** r_multiple = pnl / stake. El stake es lo que se arriesga (el SL en dólares). */
export function rMultiple(pnl: number, stake: number): number {
  if (!(stake > 0)) throw new Error("El stake tiene que ser mayor que cero");
  return round(pnl / stake, 4);
}

export function outcomeFromPnl(pnl: number): Outcome {
  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "tie";
}

/**
 * A favor del spike cuando la dirección coincide con la favorecida por el índice:
 * comprar en Boom, vender en Crash. Nunca se le pregunta al usuario.
 */
export function isWithSpike(instrument: string, direction: Direction): boolean {
  return getInstrument(instrument).favoredDirection === direction;
}

/** P/L por defecto con SL y TP fijos: ganada cobra el TP, perdida pierde el stake. */
export function defaultPnl(result: Outcome, stake: number, tp: number | null): number {
  if (result === "win") return round(tp ?? stake * 2, 2);
  if (result === "loss") return round(-stake, 2);
  return 0;
}

export interface TradeCore {
  instrument: string;
  direction: Direction;
  stake: number;
  pnl: number;
  checklist: Checklist;
}

export interface DerivedTrade {
  with_spike: boolean;
  r_multiple: number;
  outcome: Outcome;
  moved_sl: boolean;
  in_plan: boolean;
}

export function deriveTrade(t: TradeCore): DerivedTrade {
  return {
    with_spike: isWithSpike(t.instrument, t.direction),
    r_multiple: rMultiple(t.pnl, t.stake),
    outcome: outcomeFromPnl(t.pnl),
    moved_sl: hasMovedSl(t.checklist),
    in_plan: isInPlan(t.checklist),
  };
}
