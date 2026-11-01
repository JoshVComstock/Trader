import type { DailyMetrics } from "@/lib/calc/metrics";
import type { Checklist } from "@/lib/domain/checklist";
import type { InstrumentCode } from "@/lib/domain/instruments";
import type { UserSettings } from "@/lib/domain/psych";
import type { AccountKind, Direction, JournalMode, Mood, Outcome, SessionStatus } from "@/lib/domain/types";
import type { Rule } from "@/lib/rules/types";

/** Tipos de dominio que ve la app. Sin dependencias del servidor: se importan desde el cliente. */

export interface Account {
  id: string;
  label: string;
  kind: AccountKind;
  currency: string;
  start_balance: number;
  broker: string;
  /** Suma de la ganancia y pérdida de todas las operaciones. */
  pnl_total: number;
  deposits_total: number;
  withdrawals_total: number;
  /** Lo que hay hoy en la cuenta: inicial + operaciones + depósitos − retiros. */
  balance: number;
}

export type CashflowKind = "withdrawal" | "deposit";

/** Retiro o depósito de una cuenta. */
export interface Cashflow {
  id: string;
  account_id: string;
  kind: CashflowKind;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
}

export interface Strategy {
  id: string;
  name: string;
  context_tf: string;
  entry_tf: string;
  notes: string | null;
  active: boolean;
  /** Pasos de la estrategia, en orden, para marcar antes de entrar. */
  steps: string[];
}

export interface Session {
  id: string;
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
  /** Objetivo del día en dólares. */
  goal_amount: number | null;
}

export interface JournalTrade {
  id: string;
  session_id: string;
  session_date: string;
  account_id: string;
  strategy_id: string | null;
  instrument: InstrumentCode;
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
  checklist: Checklist;
  note: string | null;
  anxiety: number | null;
  /** Monto con el que entraste (multiplicadores). */
  entry_amount: number | null;
  multiplier: number | null;
  violations: number;
}

export interface CalmMessage {
  date: string;
  text: string;
}

export interface WeeklyReview {
  week_start: string;
  answer: string;
}

export interface Observation {
  id: string;
  account_id: string | null;
  instrument: string | null;
  kind: "zona" | "patron" | "nota";
  level: number | null;
  timeframe: string | null;
  note: string;
  times_seen: number;
  last_seen_at: string;
}

export interface JournalData {
  mode: JournalMode;
  accounts: Account[];
  account: Account | null;
  month: string;
  /** Un resumen por día operado de la cuenta, de toda su historia. */
  daily: DailyMetrics[];
  trades: JournalTrade[];
  strategies: Strategy[];
  rules: Rule[];
  /** Sesión de hoy (en vivo) o la última sesión (backtesting). */
  session: Session | null;
  sessionTrades: JournalTrade[];
  /** La última operación de la cuenta, para pre-rellenar el formulario. */
  lastTrade: JournalTrade | null;
  today: string;
  settings: UserSettings;
  calmMessages: CalmMessage[];
  /** Lo que respondiste en la última revisión (si es de la semana pasada o esta). */
  lastReview: WeeklyReview | null;
  /** Es domingo y todavía no revisaste esta semana. */
  reviewDue: boolean;
  observations: Observation[];
  /** Objetivo de cada día del mes (YYYY-MM-DD → dólares), para el calendario. */
  goals: Record<string, number>;
  /** Retiros y depósitos de la cuenta, del más nuevo al más viejo. */
  cashflows: Cashflow[];
}

export interface TradeViolation {
  id: string;
  rule_type: string;
  message: string;
  created_at: string;
}

export interface TradeAttachment {
  id: string;
  path: string;
  width: number;
  height: number;
  bytes: number;
}

export interface TradeDetail {
  trade: JournalTrade;
  account: Account;
  strategy: Strategy | null;
  session: Session;
  violations: TradeViolation[];
  attachments: TradeAttachment[];
}

export interface ReviewTrade extends JournalTrade {
  account_label: string;
  violation_types: string[];
}

export interface ReviewData {
  weekStart: string;
  weekEnd: string;
  today: string;
  accounts: Account[];
  strategies: Strategy[];
  trades: ReviewTrade[];
  review: WeeklyReview | null;
  /** Días de la semana con sesión, para saber si seguiste el plan. */
  sessions: {
    date: string;
    followed_plan: boolean | null;
    status: SessionStatus;
    journal: string | null;
    goal_amount: number | null;
    account_id: string;
  }[];
}
