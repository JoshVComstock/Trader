import { requireUser } from "@/lib/auth";
import { kindsForMode, type JournalMode } from "@/lib/domain/types";
import { isSunday, weekStart } from "@/lib/psych";
import {
  getDay,
  getLastTrade,
  getLedger,
  getMonthTrades,
  getProfile,
  getReviews,
  getSessionTrades,
  getSessionsBetween,
  getTradeDetailCached,
  getTradesBetween,
  listAccounts,
  listCalmMessages,
  listCashflows,
  listObservations,
  listStrategies,
} from "@/lib/db/queries";
import { sessionId } from "@/lib/db/schema";
import { addDays, localDate, monthRange } from "@/lib/time-core";
import type { JournalData, ReviewData, TradeDetail } from "@/lib/types";

export type * from "@/lib/types";
export { requireUser };
export { getDay, getProfile, listAccounts, listStrategies };

export function todayLocal(): string {
  return localDate(new Date());
}

/**
 * Todo lo que necesita la bitácora (o la vista de operar) de una cuenta y un mes.
 * Cada pieza sale de la caché de datos; en una visita normal no se lee Firestore.
 */
export async function getJournalData(args: { mode: JournalMode; accountId?: string; month?: string }): Promise<JournalData> {
  const { uid } = await requireUser();
  const today = todayLocal();
  const requestedMonth = args.month && /^\d{4}-\d{2}$/.test(args.month) ? args.month : null;
  let month = requestedMonth ?? today.slice(0, 7);

  const thisWeek = weekStart(today);
  const kinds = kindsForMode(args.mode);
  const [allAccounts, strategies, profile, calmMessages, reviews, observations] = await Promise.all([
    listAccounts(uid),
    listStrategies(uid),
    getProfile(uid),
    listCalmMessages(uid),
    getReviews(uid, [thisWeek, addDays(thisWeek, -7)]),
    listObservations(uid),
  ]);
  const accounts = allAccounts.filter((a) => kinds.includes(a.kind));
  const lastReview = [...reviews].sort((a, b) => b.week_start.localeCompare(a.week_start))[0] ?? null;
  const settings = profile.settings;
  const reviewDue = settings.psych.weekly_review && isSunday(today) && lastReview?.week_start !== thisWeek;

  const account = accounts.find((a) => a.id === args.accountId) ?? accounts[0] ?? null;
  const empty: JournalData = {
    mode: args.mode,
    accounts,
    account,
    month,
    daily: [],
    trades: [],
    strategies,
    rules: profile.rules,
    session: null,
    sessionTrades: [],
    lastTrade: null,
    today,
    settings,
    calmMessages,
    lastReview,
    reviewDue,
    observations,
    goals: {},
    cashflows: [],
  };
  if (!account) return empty;

  const ledger = await getLedger(uid, account.id);
  // En backtesting se abre en el mes del último día cargado, no en el mes actual.
  const latest = ledger.sessions.at(-1) ?? null;
  if (args.mode === "backtest" && !requestedMonth && latest) month = latest.date.slice(0, 7);

  const session =
    args.mode === "live" ? (ledger.sessions.find((s) => s.id === sessionId(account.id, today)) ?? null) : latest;

  const [trades, sessionTrades, lastTrade, cashflows] = await Promise.all([
    getMonthTrades(uid, account.id, month),
    session ? getSessionTrades(uid, account.id, session.id) : Promise.resolve([]),
    getLastTrade(uid, account.id),
    args.mode === "live" ? listCashflows(uid, account.id) : Promise.resolve([]),
  ]);

  const { from, to } = monthRange(month);
  const goals = Object.fromEntries(
    ledger.sessions
      .filter((s) => s.date >= from && s.date <= to && s.goal_amount !== null)
      .map((s) => [s.date, s.goal_amount as number]),
  );

  return { ...empty, month, daily: ledger.daily, trades, session, sessionTrades, lastTrade, goals, cashflows };
}

export async function getTradeDetail(id: string): Promise<TradeDetail | null> {
  const { uid } = await requireUser();
  return getTradeDetailCached(uid, id);
}

/** Datos de la revisión de una semana (lunes a domingo), solo cuentas reales y demo. */
export async function getReviewData(requestedWeek?: string): Promise<ReviewData> {
  const { uid } = await requireUser();
  const today = todayLocal();
  const fallback = isSunday(today) ? weekStart(today) : addDays(weekStart(today), -7);
  const start = requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek) ? weekStart(requestedWeek) : fallback;
  const end = addDays(start, 6);

  const [allAccounts, strategies, trades, sessions, reviews] = await Promise.all([
    listAccounts(uid),
    listStrategies(uid),
    getTradesBetween(uid, start, end),
    getSessionsBetween(uid, start, end),
    getReviews(uid, [start]),
  ]);
  const live = kindsForMode("live");
  const accounts = allAccounts.filter((a) => live.includes(a.kind));
  const labels = new Map(accounts.map((a) => [a.id, a.label]));

  return {
    weekStart: start,
    weekEnd: end,
    today,
    accounts,
    strategies,
    trades: trades
      .filter((t) => labels.has(t.account_id))
      .map((t) => {
        const { violation_messages, shots, ...rest } = t;
        void violation_messages;
        void shots;
        return { ...rest, account_label: labels.get(t.account_id)! };
      }),
    review: reviews[0] ?? null,
    sessions: sessions
      .filter((s) => labels.has(s.account_id))
      .map((s) => ({
        date: s.date,
        followed_plan: s.followed_plan,
        status: s.status,
        journal: s.journal,
        goal_amount: s.goal_amount,
        account_id: s.account_id,
      })),
  };
}
