import { redirect } from "next/navigation";
import { cache } from "react";
import { toChecklist, type Checklist } from "@/lib/domain/checklist";
import type { InstrumentCode } from "@/lib/domain/instruments";
import {
  kindsForMode,
  type AccountKind,
  type Direction,
  type JournalMode,
  type Mood,
  type Outcome,
  type SessionStatus,
} from "@/lib/domain/types";
import type { DailyMetrics } from "@/lib/calc/metrics";
import type { Rule } from "@/lib/rules/types";
import { parseRules } from "@/lib/schemas";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import { localDate, monthRange } from "@/lib/time-core";

export interface Account {
  id: string;
  label: string;
  kind: AccountKind;
  currency: string;
  start_balance: number;
  broker: string;
}

export interface Strategy {
  id: string;
  name: string;
  context_tf: string;
  entry_tf: string;
  notes: string | null;
  active: boolean;
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
  violations: number;
}

/** Usuario autenticado, deduplicado por petición. Redirige al login si no hay sesión. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
});

export function todayLocal(): string {
  return localDate(new Date());
}

export async function listAccounts(supabase: ServerClient, kinds?: AccountKind[]): Promise<Account[]> {
  let q = supabase
    .from("accounts")
    .select("id, label, kind, currency, start_balance, broker")
    .order("created_at");
  if (kinds) q = q.in("kind", kinds);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function listStrategies(supabase: ServerClient): Promise<Strategy[]> {
  const { data, error } = await supabase
    .from("strategies")
    .select("id, name, context_tf, entry_tf, notes, active")
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function listRules(supabase: ServerClient): Promise<Rule[]> {
  const { data, error } = await supabase.from("rules").select("type, params, action, enabled");
  if (error) throw error;
  return parseRules(data);
}

const SESSION_COLUMNS =
  "id, account_id, date, opened_at, closed_at, mood_before, read_rules, goal_r, followed_plan, journal, status, blocked_reason";

const TRADE_COLUMNS =
  "id, session_id, account_id, strategy_id, instrument, direction, with_spike, opened_at, closed_at, stake, tp, pnl, r_multiple, outcome, mood, moved_sl, in_plan, checklist, note, sessions!inner(date), rule_violations(count)";

interface TradeRow {
  id: string;
  session_id: string;
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
  checklist: unknown;
  note: string | null;
  sessions: { date: string };
  rule_violations: { count: number }[];
}

function toJournalTrade(row: TradeRow): JournalTrade {
  return {
    id: row.id,
    session_id: row.session_id,
    session_date: row.sessions.date,
    account_id: row.account_id,
    strategy_id: row.strategy_id,
    instrument: row.instrument as InstrumentCode,
    direction: row.direction,
    with_spike: row.with_spike,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    stake: Number(row.stake),
    tp: row.tp === null ? null : Number(row.tp),
    pnl: Number(row.pnl),
    r_multiple: Number(row.r_multiple),
    outcome: row.outcome,
    mood: row.mood,
    moved_sl: row.moved_sl,
    in_plan: row.in_plan,
    checklist: toChecklist(row.checklist),
    note: row.note,
    violations: row.rule_violations[0]?.count ?? 0,
  };
}

export async function getSessionTrades(supabase: ServerClient, sessionId: string): Promise<JournalTrade[]> {
  const { data, error } = await supabase
    .from("trades")
    .select(TRADE_COLUMNS)
    .eq("session_id", sessionId)
    .order("opened_at");
  if (error) throw error;
  return (data as unknown as TradeRow[]).map(toJournalTrade);
}

export interface JournalData {
  mode: JournalMode;
  accounts: Account[];
  account: Account | null;
  month: string;
  /** Todas las filas de metrics_daily de la cuenta (una por día operado). */
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
}

export async function getJournalData(args: {
  mode: JournalMode;
  accountId?: string;
  month?: string;
}): Promise<JournalData> {
  const { supabase } = await requireUser();
  const today = todayLocal();
  const requestedMonth = args.month && /^\d{4}-\d{2}$/.test(args.month) ? args.month : null;
  let month = requestedMonth ?? today.slice(0, 7);

  const [accounts, strategies, rules] = await Promise.all([
    listAccounts(supabase, kindsForMode(args.mode)),
    listStrategies(supabase),
    listRules(supabase),
  ]);

  const account = accounts.find((a) => a.id === args.accountId) ?? accounts[0] ?? null;

  // En backtesting se abre en el mes del último día cargado, no en el mes actual.
  if (account && args.mode === "backtest" && !requestedMonth) {
    const { data: latest } = await supabase
      .from("sessions")
      .select("date")
      .eq("account_id", account.id)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) month = latest.date.slice(0, 7);
  }
  const empty: JournalData = {
    mode: args.mode,
    accounts,
    account,
    month,
    daily: [],
    trades: [],
    strategies,
    rules,
    session: null,
    sessionTrades: [],
    lastTrade: null,
    today,
  };
  if (!account) return empty;

  const { from, to } = monthRange(month);

  const sessionQuery =
    args.mode === "live"
      ? supabase.from("sessions").select(SESSION_COLUMNS).eq("account_id", account.id).eq("date", today).maybeSingle()
      : supabase
          .from("sessions")
          .select(SESSION_COLUMNS)
          .eq("account_id", account.id)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();

  const [dailyRes, tradesRes, sessionRes, lastRes] = await Promise.all([
    supabase
      .from("metrics_daily")
      .select("date, trades, wins, losses, pnl, gross_profit, gross_loss, r_sum, with_spike_trades, compliance_pct, max_drawdown")
      .eq("account_id", account.id)
      .order("date"),
    supabase
      .from("trades")
      .select(TRADE_COLUMNS)
      .eq("account_id", account.id)
      .gte("sessions.date", from)
      .lte("sessions.date", to)
      .order("opened_at", { ascending: false }),
    sessionQuery,
    supabase
      .from("trades")
      .select(TRADE_COLUMNS)
      .eq("account_id", account.id)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (dailyRes.error) throw dailyRes.error;
  if (tradesRes.error) throw tradesRes.error;
  if (sessionRes.error) throw sessionRes.error;
  if (lastRes.error) throw lastRes.error;

  const session = (sessionRes.data as Session | null) ?? null;
  const sessionTrades = session ? await getSessionTrades(supabase, session.id) : [];

  return {
    ...empty,
    daily: dailyRes.data.map((d) => ({
      ...d,
      pnl: Number(d.pnl),
      gross_profit: Number(d.gross_profit),
      gross_loss: Number(d.gross_loss),
      r_sum: Number(d.r_sum),
      compliance_pct: Number(d.compliance_pct),
      max_drawdown: Number(d.max_drawdown),
    })),
    trades: (tradesRes.data as unknown as TradeRow[]).map(toJournalTrade),
    session: session ? { ...session, goal_r: session.goal_r === null ? null : Number(session.goal_r) } : null,
    sessionTrades,
    lastTrade: lastRes.data ? toJournalTrade(lastRes.data as unknown as TradeRow) : null,
  };
}

export interface TradeDetail {
  trade: JournalTrade;
  account: Account;
  strategy: Strategy | null;
  session: Session;
  violations: { id: string; rule_type: string; message: string; created_at: string }[];
  attachments: { id: string; path: string; width: number; height: number; bytes: number }[];
}

export async function getTradeDetail(id: string): Promise<TradeDetail | null> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("trades").select(TRADE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const trade = toJournalTrade(data as unknown as TradeRow);

  const [accountRes, strategyRes, sessionRes, violationsRes, attachmentsRes] = await Promise.all([
    supabase.from("accounts").select("id, label, kind, currency, start_balance, broker").eq("id", trade.account_id).single(),
    trade.strategy_id
      ? supabase.from("strategies").select("id, name, context_tf, entry_tf, notes, active").eq("id", trade.strategy_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("sessions").select(SESSION_COLUMNS).eq("id", trade.session_id).single(),
    supabase.from("rule_violations").select("id, rule_type, message, created_at").eq("trade_id", id).order("created_at"),
    supabase.from("attachments").select("id, path, width, height, bytes").eq("trade_id", id).order("created_at"),
  ]);

  for (const r of [accountRes, strategyRes, sessionRes, violationsRes, attachmentsRes]) {
    if (r.error) throw r.error;
  }

  return {
    trade,
    account: accountRes.data!,
    strategy: strategyRes.data ?? null,
    session: sessionRes.data as Session,
    violations: violationsRes.data ?? [],
    attachments: attachmentsRes.data ?? [],
  };
}
