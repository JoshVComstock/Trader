import { unstable_cache } from "next/cache";
import type { DailyMetrics } from "@/lib/calc/metrics";
import { DEFAULT_PAUSE_PHRASE, toPsychFlags, type UserSettings } from "@/lib/domain/psych";
import type { Rule } from "@/lib/rules/types";
import { parseRules } from "@/lib/schemas";
import { monthRange, addDays } from "@/lib/time-core";
import type {
  Account,
  CalmMessage,
  Cashflow,
  JournalTrade,
  Observation,
  Session,
  Strategy,
  TradeDetail,
  WeeklyReview,
} from "@/lib/types";
import { db } from "./admin";
import { DEFAULT_RULES } from "./defaults";
import {
  refs,
  sessionId,
  toAccount,
  toCashflow,
  toDaily,
  toObservation,
  toSession,
  toStrategy,
  toTrade,
  type TradeDoc,
  type UserDoc,
  type WeeklyReviewDoc,
} from "./schema";
import { tags } from "./tags";

/**
 * Lecturas de Firestore, todas pasando por la caché de datos de Next. Una lectura repetida se
 * sirve de la caché hasta que un Server Action invalida su etiqueta (ver `tags.ts`); el día de
 * vida es solo una red de seguridad.
 */
const DAY = 60 * 60 * 24;

function cached<T>(key: string[], cacheTags: string[], fn: () => Promise<T>): Promise<T> {
  return unstable_cache(fn, key, { tags: cacheTags, revalidate: DAY })();
}

const byCreated = <T extends { created_at?: string }>(a: T, b: T) => (a.created_at ?? "").localeCompare(b.created_at ?? "");

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

export interface Profile {
  settings: UserSettings;
  rules: Rule[];
}

export function getProfile(uid: string): Promise<Profile> {
  return cached(["profile", uid], [tags.profile(uid)], async () => {
    const snap = await refs(db(), uid).user.get();
    const d = (snap.data() ?? {}) as Partial<UserDoc>;
    // Una regla que nunca se guardó usa su valor por defecto.
    const rules = { ...DEFAULT_RULES, ...d.rules };
    return {
      settings: { psych: toPsychFlags(d.psych), pausePhrase: d.pause_phrase?.trim() || DEFAULT_PAUSE_PHRASE },
      rules: parseRules(Object.entries(rules).map(([type, r]) => ({ type, ...r }))),
    };
  });
}

// ---------------------------------------------------------------------------
// Cuentas y estrategias
// ---------------------------------------------------------------------------

export function listAccounts(uid: string): Promise<Account[]> {
  return cached(["accounts", uid], [tags.accounts(uid)], async () => {
    const snap = await refs(db(), uid).accounts.get();
    return snap.docs
      .sort((a, b) => byCreated(a.data(), b.data()))
      .map(toAccount);
  });
}

export function listStrategies(uid: string): Promise<Strategy[]> {
  return cached(["strategies", uid], [tags.strategies(uid)], async () => {
    const snap = await refs(db(), uid).strategies.get();
    return snap.docs.sort((a, b) => byCreated(a.data(), b.data())).map(toStrategy);
  });
}

// ---------------------------------------------------------------------------
// Libro de una cuenta: sesiones, operaciones, movimientos
// ---------------------------------------------------------------------------

export interface AccountLedger {
  /** Todas las sesiones de la cuenta, de la más vieja a la más nueva. */
  sessions: Session[];
  /** Un resumen por día con operaciones. */
  daily: DailyMetrics[];
}

/** Una sola consulta trae la historia completa de la cuenta (un documento por día). */
export function getLedger(uid: string, accountId: string): Promise<AccountLedger> {
  return cached(["ledger", uid, accountId], [tags.ledger(uid, accountId)], async () => {
    const snap = await refs(db(), uid).sessions.where("account_id", "==", accountId).get();
    const docs = snap.docs.sort((a, b) => String(a.get("date")).localeCompare(String(b.get("date"))));
    return {
      sessions: docs.map(toSession),
      daily: docs.map(toDaily).filter((d): d is DailyMetrics => d !== null),
    };
  });
}

/** Operaciones de unas sesiones (de a 30, el máximo de `in`). */
async function tradesOfSessions(uid: string, sessionIds: readonly string[]): Promise<JournalTrade[]> {
  const col = refs(db(), uid).trades;
  const chunks: string[][] = [];
  for (let i = 0; i < sessionIds.length; i += 30) chunks.push(sessionIds.slice(i, i + 30));
  const snaps = await Promise.all(chunks.map((ids) => col.where("session_id", "in", ids).get()));
  return snaps.flatMap((s) => s.docs.map(toTrade));
}

const newestFirst = (a: JournalTrade, b: JournalTrade) => b.opened_at.localeCompare(a.opened_at);

/** Operaciones del mes de una cuenta, de la más nueva a la más vieja. */
export function getMonthTrades(uid: string, accountId: string, month: string): Promise<JournalTrade[]> {
  return cached(["month-trades", uid, accountId, month], [tags.ledger(uid, accountId)], async () => {
    const { from, to } = monthRange(month);
    const ids: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) ids.push(sessionId(accountId, d));
    return (await tradesOfSessions(uid, ids)).sort(newestFirst);
  });
}

/** Operaciones de una sesión, en orden de apertura. */
export function getSessionTrades(uid: string, accountId: string, id: string): Promise<JournalTrade[]> {
  return cached(["session-trades", uid, id], [tags.ledger(uid, accountId)], async () => {
    const snap = await refs(db(), uid).trades.where("session_id", "==", id).get();
    return snap.docs.map(toTrade).sort((a, b) => a.opened_at.localeCompare(b.opened_at));
  });
}

/** La última operación registrada en la cuenta (se guarda su id en la cuenta). */
export function getLastTrade(uid: string, accountId: string): Promise<JournalTrade | null> {
  return cached(["last-trade", uid, accountId], [tags.ledger(uid, accountId)], async () => {
    const r = refs(db(), uid);
    const account = await r.accounts.doc(accountId).get();
    const id = account.get("last_trade_id") as string | null | undefined;
    if (!id) return null;
    const snap = await r.trades.doc(id).get();
    return snap.exists ? toTrade(snap) : null;
  });
}

export function listCashflows(uid: string, accountId: string): Promise<Cashflow[]> {
  return cached(["cashflows", uid, accountId], [tags.ledger(uid, accountId)], async () => {
    const snap = await refs(db(), uid).cashflows.where("account_id", "==", accountId).get();
    return snap.docs
      .map(toCashflow)
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  });
}

// ---------------------------------------------------------------------------
// Control mental
// ---------------------------------------------------------------------------

/** Reflexiones de días en que seguiste el plan: lo que te dice tu yo tranquilo. */
export function listCalmMessages(uid: string): Promise<CalmMessage[]> {
  return cached(["calm", uid], [tags.ledgers(uid)], async () => {
    const snap = await refs(db(), uid).sessions.where("followed_plan", "==", true).get();
    return snap.docs
      .map((d) => ({ date: String(d.get("date")), text: String(d.get("journal") ?? "").trim() }))
      .filter((m) => m.text)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12);
  });
}

/** Revisiones de unas semanas (por su lunes), las que existan. */
export function getReviews(uid: string, weekStarts: readonly string[]): Promise<WeeklyReview[]> {
  return cached(["reviews", uid, ...weekStarts], [tags.reviews(uid)], async () => {
    const r = refs(db(), uid);
    const snaps = await db().getAll(...weekStarts.map((w) => r.reviews.doc(w)));
    return snaps
      .filter((s) => s.exists)
      .map((s) => {
        const d = s.data() as WeeklyReviewDoc;
        return { week_start: d.week_start, answer: d.answer };
      });
  });
}

export function listObservations(uid: string): Promise<Observation[]> {
  return cached(["observations", uid], [tags.observations(uid)], async () => {
    const snap = await refs(db(), uid).observations.get();
    return snap.docs
      .map(toObservation)
      .sort((a, b) => b.times_seen - a.times_seen || b.last_seen_at.localeCompare(a.last_seen_at))
      .slice(0, 300);
  });
}

// ---------------------------------------------------------------------------
// Lecturas que cruzan cuentas
// ---------------------------------------------------------------------------

export function getTradeDetailCached(uid: string, tradeId: string): Promise<TradeDetail | null> {
  return cached(["trade-detail", uid, tradeId], [tags.ledgers(uid)], async () => {
    const r = refs(db(), uid);
    const snap = await r.trades.doc(tradeId).get();
    if (!snap.exists) return null;
    const doc = snap.data() as TradeDoc;
    const trade = toTrade(snap);
    const [account, strategy, session] = await Promise.all([
      r.accounts.doc(trade.account_id).get(),
      trade.strategy_id ? r.strategies.doc(trade.strategy_id).get() : Promise.resolve(null),
      r.sessions.doc(trade.session_id).get(),
    ]);
    if (!account.exists || !session.exists) return null;
    return {
      trade,
      account: toAccount(account),
      strategy: strategy?.exists ? toStrategy(strategy) : null,
      session: toSession(session),
      violations: [...(doc.violations ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      attachments: [...(doc.attachments ?? [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(({ id, path, width, height, bytes }) => ({ id, path, width, height, bytes })),
    };
  });
}

export interface RangeTrade extends JournalTrade {
  violation_types: string[];
  violation_messages: string[];
  shots: { id: string; path: string; width: number; height: number }[];
}

function toRangeTrade(snap: FirebaseFirestore.QueryDocumentSnapshot): RangeTrade {
  const d = snap.data() as TradeDoc;
  return {
    ...toTrade(snap),
    violation_types: (d.violations ?? []).map((v) => v.rule_type),
    violation_messages: (d.violations ?? []).map((v) => v.message),
    shots: (d.attachments ?? []).map(({ id, path, width, height }) => ({ id, path, width, height })),
  };
}

/** Operaciones de todas las cuentas entre dos días (inclusive), en orden de apertura. */
export function getTradesBetween(uid: string, from: string, to: string): Promise<RangeTrade[]> {
  return cached(["trades-between", uid, from, to], [tags.ledgers(uid)], async () => {
    const snap = await refs(db(), uid).trades.where("session_date", ">=", from).where("session_date", "<=", to).get();
    return snap.docs.map(toRangeTrade).sort((a, b) => a.opened_at.localeCompare(b.opened_at));
  });
}

/** Sesiones de todas las cuentas entre dos días (inclusive). */
export function getSessionsBetween(uid: string, from: string, to: string): Promise<Session[]> {
  return cached(["sessions-between", uid, from, to], [tags.ledgers(uid)], async () => {
    const snap = await refs(db(), uid).sessions.where("date", ">=", from).where("date", "<=", to).get();
    return snap.docs.map(toSession).sort((a, b) => a.date.localeCompare(b.date));
  });
}

/** Una sesión con sus operaciones completas (violaciones y capturas incluidas). */
export function getDay(uid: string, accountId: string, date: string): Promise<{ session: Session | null; trades: RangeTrade[] }> {
  return cached(["day", uid, accountId, date], [tags.ledger(uid, accountId)], async () => {
    const r = refs(db(), uid);
    const id = sessionId(accountId, date);
    const [session, trades] = await Promise.all([r.sessions.doc(id).get(), r.trades.where("session_id", "==", id).get()]);
    if (!session.exists) return { session: null, trades: [] };
    return {
      session: toSession(session),
      trades: trades.docs.map(toRangeTrade).sort((a, b) => a.opened_at.localeCompare(b.opened_at)),
    };
  });
}
