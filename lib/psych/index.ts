/**
 * Control mental: módulos puros, sin dependencias, con tests.
 */
import { addDays } from "../time-core";
import type { Rule } from "../rules/types";

// ---------------------------------------------------------------------------
// Pausa después de una pérdida
// ---------------------------------------------------------------------------

export interface PauseTrade {
  opened_at: string;
  closed_at: string | null;
  pnl: number;
}

export interface PauseState {
  active: boolean;
  /** Segundos que faltan para poder registrar otra vez. */
  remainingSec: number;
  totalSec: number;
  /** Cuándo termina la pausa (ISO). */
  endsAt: string | null;
}

const NO_PAUSE: PauseState = { active: false, remainingSec: 0, totalSec: 0, endsAt: null };

/** Segundos de pausa que manda la regla `min_gap_seconds`, o null si está apagada. */
export function pauseSeconds(rules: readonly Rule[]): number | null {
  const rule = rules.find((r) => r.type === "min_gap_seconds" && r.enabled);
  return rule?.type === "min_gap_seconds" && rule.params.seconds > 0 ? rule.params.seconds : null;
}

/**
 * Tras una operación perdida, no se puede registrar otra hasta que pasen los segundos de la regla
 * de pausa mínima, contados desde el cierre (o la apertura si no hubo cierre).
 */
export function pauseState(trades: readonly PauseTrade[], rules: readonly Rule[], now: string): PauseState {
  const seconds = pauseSeconds(rules);
  if (seconds === null || trades.length === 0) return NO_PAUSE;
  const last = [...trades].sort((a, b) => Date.parse(a.opened_at) - Date.parse(b.opened_at)).at(-1)!;
  if (last.pnl >= 0) return NO_PAUSE;
  const start = Date.parse(last.closed_at ?? last.opened_at);
  const end = start + seconds * 1000;
  const remainingSec = Math.ceil((end - Date.parse(now)) / 1000);
  if (remainingSec <= 0) return NO_PAUSE;
  return { active: true, remainingSec: Math.min(remainingSec, seconds), totalSec: seconds, endsAt: new Date(end).toISOString() };
}

// ---------------------------------------------------------------------------
// Detector de tilt
// ---------------------------------------------------------------------------

export interface TiltTrade {
  opened_at: string;
  stake: number;
  pnl: number;
  with_spike: boolean;
}

export type TiltSignal = "loss" | "bigger_stake" | "against_spike";

export interface TiltResult {
  /** "tilt" con las tres señales; "risk" con dos. */
  level: "none" | "risk" | "tilt";
  signals: TiltSignal[];
  message: string | null;
}

export const TILT_WINDOW_MINUTES = 10;

const SIGNAL_TEXT: Record<TiltSignal, string> = {
  loss: "vienes de perder",
  bigger_stake: "subiste el stake",
  against_spike: "vas contra el spike",
};

/**
 * Ninguna regla sola delata el tilt; la combinación sí. Mira la candidata y las operaciones de los
 * últimos 10 minutos: pérdida reciente, stake mayor que el de esa pérdida y entrada contra el spike.
 */
export function detectTilt(candidate: TiltTrade, previous: readonly TiltTrade[]): TiltResult {
  const t = Date.parse(candidate.opened_at);
  const windowStart = t - TILT_WINDOW_MINUTES * 60_000;
  const recent = previous.filter((p) => {
    const at = Date.parse(p.opened_at);
    return at >= windowStart && at <= t;
  });
  const losses = recent.filter((p) => p.pnl < 0);
  const signals: TiltSignal[] = [];
  if (losses.length > 0) signals.push("loss");
  const smallestLossStake = losses.length ? Math.min(...losses.map((l) => l.stake)) : null;
  if (smallestLossStake !== null && candidate.stake > smallestLossStake + 1e-9) signals.push("bigger_stake");
  if (!candidate.with_spike) signals.push("against_spike");

  // Sin pérdida reciente no hay tilt: contra el spike solo ya lo muestra el formulario.
  if (!signals.includes("loss") || signals.length < 2) return { level: "none", signals, message: null };
  const text = signals.map((s) => SIGNAL_TEXT[s]).join(", ");
  if (signals.length === 3) {
    return {
      level: "tilt",
      signals,
      message: `Esto es tilt: ${text}. Cierra la plataforma cinco minutos antes de entrar.`,
    };
  }
  return { level: "risk", signals, message: `Cuidado: ${text}. Es el comienzo típico de una revancha.` };
}

// ---------------------------------------------------------------------------
// Racha de disciplina
// ---------------------------------------------------------------------------

export interface StreakDay {
  date: string;
  compliance_pct: number;
}

export interface Streak {
  /** Días operados seguidos, hasta el último, respetando todas las reglas. */
  current: number;
  best: number;
  /** El último día operado rompió alguna regla. */
  brokenOnLast: boolean;
}

/**
 * Cuenta días operados (los días sin operar no cortan ni suman). Un día cuenta si no tuvo ninguna
 * violación: llegar al límite y bloquear la sesión es respetar la regla, no romperla.
 */
export function disciplineStreak(days: readonly StreakDay[]): Streak {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let run = 0;
  let best = 0;
  for (const d of sorted) {
    if (d.compliance_pct >= 100) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  const last = sorted.at(-1);
  return { current: run, best, brokenOnLast: last ? last.compliance_pct < 100 : false };
}

// ---------------------------------------------------------------------------
// Semanas (revisión de los domingos)
// ---------------------------------------------------------------------------

/** Lunes de la semana de una fecha YYYY-MM-DD. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
}

export function isSunday(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}
