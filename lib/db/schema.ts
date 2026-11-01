import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { round } from "@/lib/calc/trade";
import type { DayMetrics } from "@/lib/calc/daily";
import type { DailyMetrics } from "@/lib/calc/metrics";
import { toChecklist } from "@/lib/domain/checklist";
import type { InstrumentCode } from "@/lib/domain/instruments";
import type { AccountKind, Direction, Mood, Outcome, SessionStatus } from "@/lib/domain/types";
import type {
  Account,
  Cashflow,
  CashflowKind,
  JournalTrade,
  Observation,
  Session,
  Strategy,
  TradeAttachment,
  TradeViolation,
} from "@/lib/types";

/**
 * Modelo en Firestore. Todo cuelga de `users/{uid}`, así un usuario nunca toca datos de otro
 * y cada consulta es sobre una colección chica.
 *
 *   users/{uid}                      perfil: reglas, control mental, frase de pausa
 *   users/{uid}/accounts/{id}        cuenta + totales (P/L, depósitos, retiros) para el balance
 *   users/{uid}/strategies/{id}
 *   users/{uid}/sessions/{acc_date}  un día de una cuenta + su resumen (métricas del día)
 *   users/{uid}/trades/{id}          operación con sus violaciones y capturas adentro
 *   users/{uid}/cashflows/{id}       retiros y depósitos
 *   users/{uid}/weekly_reviews/{lunes}
 *   users/{uid}/observations/{id}
 *
 * Las fechas se guardan como texto ISO en UTC (ordenan bien como texto y no hay que convertirlas
 * al pasar por la caché de Next).
 */

export interface UserDoc {
  email: string | null;
  created_at: string;
  psych: Record<string, boolean>;
  pause_phrase: string | null;
  rules: Record<string, { params: unknown; action: string; enabled: boolean }>;
}

export interface AccountDoc {
  label: string;
  kind: AccountKind;
  currency: string;
  start_balance: number;
  broker: string;
  created_at: string;
  pnl_total: number;
  deposits_total: number;
  withdrawals_total: number;
  last_trade_id: string | null;
}

export interface StrategyDoc {
  name: string;
  context_tf: string;
  entry_tf: string;
  notes: string | null;
  active: boolean;
  steps: string[];
  created_at: string;
}

export interface SessionDoc {
  account_id: string;
  date: string;
  opened_at: string;
  closed_at: string | null;
  mood_before: Mood | null;
  read_rules: boolean;
  goal_r: number | null;
  followed_plan: boolean | null;
  journal: string | null;
  status: SessionStatus;
  blocked_reason: string | null;
  planned_minutes: number | null;
  goal_amount: number | null;
  created_at: string;
  /** Resumen del día; null si no hay operaciones. */
  metrics: DayMetrics | null;
}

export interface TradeDoc {
  session_id: string;
  session_date: string;
  account_id: string;
  strategy_id: string | null;
  instrument: string;
  direction: Direction;
  with_spike: boolean;
  opened_at: string;
  closed_at: string | null;
  stake: number;
  tp: number | null;
  pnl: number;
  r_multiple: number;
  outcome: Outcome;
  mood: Mood | null;
  moved_sl: boolean;
  in_plan: boolean;
  checklist: Record<string, boolean>;
  note: string | null;
  anxiety: number | null;
  entry_amount: number | null;
  multiplier: number | null;
  created_at: string;
  violations: TradeViolation[];
  attachments: (TradeAttachment & { created_at: string })[];
}

export interface CashflowDoc {
  account_id: string;
  kind: CashflowKind;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
}

export interface WeeklyReviewDoc {
  week_start: string;
  answer: string;
  created_at: string;
  updated_at: string;
}

export interface ObservationDoc {
  account_id: string | null;
  instrument: string | null;
  kind: Observation["kind"];
  level: number | null;
  timeframe: string | null;
  note: string;
  times_seen: number;
  last_seen_at: string;
  created_at: string;
}

/** Id de la sesión de una cuenta en un día: se lee directo, sin consultas. */
export function sessionId(accountId: string, date: string): string {
  return `${accountId}_${date}`;
}

export function refs(firestore: Firestore, uid: string) {
  const user = firestore.collection("users").doc(uid);
  return {
    user,
    accounts: user.collection("accounts"),
    strategies: user.collection("strategies"),
    sessions: user.collection("sessions"),
    trades: user.collection("trades"),
    cashflows: user.collection("cashflows"),
    reviews: user.collection("weekly_reviews"),
    observations: user.collection("observations"),
  };
}

export type Refs = ReturnType<typeof refs>;

// ---------------------------------------------------------------------------
// Documento → tipo de la app
// ---------------------------------------------------------------------------

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function toAccount(snap: DocumentSnapshot): Account {
  const d = snap.data() as AccountDoc;
  const start = num(d.start_balance);
  const pnl = num(d.pnl_total);
  const deposits = num(d.deposits_total);
  const withdrawals = num(d.withdrawals_total);
  return {
    id: snap.id,
    label: d.label,
    kind: d.kind,
    currency: d.currency ?? "USD",
    start_balance: start,
    broker: d.broker ?? "deriv",
    pnl_total: round(pnl, 2),
    deposits_total: round(deposits, 2),
    withdrawals_total: round(withdrawals, 2),
    balance: round(start + pnl + deposits - withdrawals, 2),
  };
}

export function toStrategy(snap: DocumentSnapshot): Strategy {
  const d = snap.data() as StrategyDoc;
  return {
    id: snap.id,
    name: d.name,
    context_tf: d.context_tf,
    entry_tf: d.entry_tf,
    notes: d.notes ?? null,
    active: d.active !== false,
    steps: Array.isArray(d.steps) ? d.steps.filter((s): s is string => typeof s === "string") : [],
  };
}

export function toSession(snap: DocumentSnapshot): Session {
  const d = snap.data() as SessionDoc;
  return {
    id: snap.id,
    account_id: d.account_id,
    date: d.date,
    opened_at: d.opened_at,
    closed_at: d.closed_at ?? null,
    mood_before: d.mood_before ?? null,
    read_rules: d.read_rules === true,
    goal_r: numOrNull(d.goal_r),
    followed_plan: d.followed_plan ?? null,
    journal: d.journal ?? null,
    status: d.status,
    blocked_reason: d.blocked_reason ?? null,
    planned_minutes: numOrNull(d.planned_minutes),
    goal_amount: numOrNull(d.goal_amount),
  };
}

/** Resumen del día guardado en la sesión, con la forma de `DailyMetrics`. */
export function toDaily(snap: DocumentSnapshot): DailyMetrics | null {
  const d = snap.data() as SessionDoc;
  return d.metrics ? { date: d.date, ...d.metrics } : null;
}

export function toTrade(snap: DocumentSnapshot): JournalTrade {
  const d = snap.data() as TradeDoc;
  return {
    id: snap.id,
    session_id: d.session_id,
    session_date: d.session_date,
    account_id: d.account_id,
    strategy_id: d.strategy_id ?? null,
    instrument: d.instrument as InstrumentCode,
    direction: d.direction,
    with_spike: d.with_spike,
    opened_at: d.opened_at,
    closed_at: d.closed_at ?? null,
    stake: num(d.stake),
    tp: numOrNull(d.tp),
    pnl: num(d.pnl),
    r_multiple: num(d.r_multiple),
    outcome: d.outcome,
    mood: d.mood ?? null,
    moved_sl: d.moved_sl === true,
    in_plan: d.in_plan !== false,
    checklist: toChecklist(d.checklist),
    note: d.note ?? null,
    anxiety: numOrNull(d.anxiety),
    entry_amount: numOrNull(d.entry_amount),
    multiplier: numOrNull(d.multiplier),
    violations: Array.isArray(d.violations) ? d.violations.length : 0,
  };
}

export function toCashflow(snap: DocumentSnapshot): Cashflow {
  const d = snap.data() as CashflowDoc;
  return {
    id: snap.id,
    account_id: d.account_id,
    kind: d.kind,
    amount: num(d.amount),
    date: d.date,
    note: d.note ?? null,
    created_at: d.created_at,
  };
}

export function toObservation(snap: DocumentSnapshot): Observation {
  const d = snap.data() as ObservationDoc;
  return {
    id: snap.id,
    account_id: d.account_id ?? null,
    instrument: d.instrument ?? null,
    kind: d.kind,
    level: numOrNull(d.level),
    timeframe: d.timeframe ?? null,
    note: d.note,
    times_seen: num(d.times_seen, 1),
    last_seen_at: d.last_seen_at,
  };
}
