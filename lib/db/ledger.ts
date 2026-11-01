import { randomUUID } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { computeDayMetrics, type DailyTrade } from "@/lib/calc/daily";
import { defaultPnl, deriveTrade, round } from "@/lib/calc/trade";
import { modeForKind, type SessionStatus } from "@/lib/domain/types";
import { evaluateTrade, type LimitReached, type Rule, type Violation } from "@/lib/rules";
import type { TradeInput } from "@/lib/schemas";
import { localDate } from "@/lib/time-core";
import { db } from "./admin";
import { refs, sessionId, toAccount, type AccountDoc, type SessionDoc, type TradeDoc } from "./schema";

/**
 * Escrituras de operaciones. Cada una corre en una transacción que, de paso, deja al día el
 * resumen del día (en la sesión) y los totales de la cuenta (para el balance). Así las lecturas
 * nunca tienen que sumar operaciones.
 */

export type LedgerFailure =
  | { ok: false; code: "not_found" | "no_session" | "session_blocked" | "session_closed" }
  | { ok: false; code: "validation"; field: "opened_at"; message: string };

export interface RecordedTrade {
  ok: true;
  accountId: string;
  sessionStatus: SessionStatus;
  violations: Violation[];
  limits: LimitReached[];
}

/** P/L final: el que escribió el usuario o el que dicta el SL/TP fijo. */
export function resolvePnl(input: TradeInput): number {
  return input.pnl ?? defaultPnl(input.result, input.stake, input.tp);
}

function toDailyTrade(id: string, t: Pick<TradeDoc, "opened_at" | "outcome" | "pnl" | "r_multiple" | "with_spike" | "violations">): DailyTrade {
  return {
    id,
    opened_at: t.opened_at,
    outcome: t.outcome,
    pnl: t.pnl,
    r_multiple: t.r_multiple,
    with_spike: t.with_spike,
    violated: (t.violations?.length ?? 0) > 0,
  };
}

/** Campos editables de una operación, ya derivados. */
function tradeFields(input: TradeInput, openedAt: string) {
  const pnl = resolvePnl(input);
  return {
    strategy_id: input.strategy_id,
    instrument: input.instrument,
    direction: input.direction,
    opened_at: openedAt,
    closed_at: input.closed_at,
    stake: input.stake,
    tp: input.tp,
    pnl,
    mood: input.mood,
    checklist: input.checklist,
    note: input.note || null,
    anxiety: input.anxiety,
    entry_amount: input.entry_amount,
    multiplier: input.multiplier,
    ...deriveTrade({ instrument: input.instrument, direction: input.direction, stake: input.stake, pnl, checklist: input.checklist }),
  } satisfies Partial<TradeDoc>;
}

async function sessionTradeDocs(tx: Transaction, uid: string, sid: string) {
  const snap = await tx.get(refs(db(), uid).trades.where("session_id", "==", sid));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TradeDoc) }));
}

/**
 * Registra una operación. El motor de reglas corre aquí otra vez porque el cliente no es confiable.
 * Si se rompe una regla `block`, la operación se guarda igual, con sus violaciones, y la sesión
 * pasa a bloqueada: la transacción rechaza cualquier operación nueva en una sesión bloqueada o cerrada.
 */
export async function recordTrade(
  uid: string,
  input: TradeInput,
  rules: readonly Rule[],
  today: string,
): Promise<RecordedTrade | LedgerFailure> {
  const r = refs(db(), uid);
  const tradeRef = r.trades.doc(input.id);
  const accountRef = r.accounts.doc(input.account_id);

  return db().runTransaction(async (tx) => {
    const [existing, accountSnap] = await Promise.all([tx.get(tradeRef), tx.get(accountRef)]);
    if (!accountSnap.exists) return { ok: false, code: "not_found" } as const;
    const accountDoc = accountSnap.data() as AccountDoc;
    const mode = modeForKind(accountDoc.kind);

    // Reintento de una operación que ya se guardó: no se duplica.
    if (existing.exists) {
      const s = await tx.get(r.sessions.doc(String(existing.get("session_id"))));
      return { ok: true, accountId: accountSnap.id, sessionStatus: (s.get("status") as SessionStatus) ?? "open", violations: [], limits: [] } as const;
    }

    const now = new Date().toISOString();
    const openedAt = input.opened_at ?? now;
    if (mode === "backtest" && !input.opened_at) {
      return { ok: false, code: "validation", field: "opened_at", message: "En backtesting indica la fecha y hora de la operación" } as const;
    }
    if (mode === "live" && Date.parse(openedAt) > Date.now() + 5 * 60_000) {
      return { ok: false, code: "validation", field: "opened_at", message: "La hora de apertura está en el futuro" } as const;
    }

    // Sesión: en vivo es la de hoy (con check-in); en backtesting se crea por día de la operación.
    const date = mode === "live" ? today : localDate(openedAt);
    const sid = sessionId(accountSnap.id, date);
    const sessionRef = r.sessions.doc(sid);
    const [sessionSnap, siblings] = await Promise.all([tx.get(sessionRef), sessionTradeDocs(tx, uid, sid)]);

    let session: SessionDoc;
    if (!sessionSnap.exists) {
      if (mode === "live") return { ok: false, code: "no_session" } as const;
      session = {
        account_id: accountSnap.id,
        date,
        opened_at: openedAt,
        closed_at: null,
        mood_before: null,
        read_rules: false,
        goal_r: null,
        followed_plan: null,
        journal: null,
        status: "open",
        blocked_reason: null,
        planned_minutes: null,
        goal_amount: null,
        created_at: now,
        metrics: null,
      };
    } else {
      session = sessionSnap.data() as SessionDoc;
      if (mode === "backtest") {
        // En backtesting no se cierra la sesión a mano: un día cerrado se reabre para seguir cargando datos.
        if (session.status === "closed") session = { ...session, status: "open", closed_at: null };
        // Registrar una operación anterior mueve el inicio de la sesión.
        if (session.status === "open" && Date.parse(openedAt) < Date.parse(session.opened_at)) {
          session = { ...session, opened_at: openedAt };
        }
      }
    }
    if (session.status === "blocked") return { ok: false, code: "session_blocked" } as const;
    if (session.status === "closed") return { ok: false, code: "session_closed" } as const;

    const fields = tradeFields(input, openedAt);
    const result = evaluateTrade({
      candidate: { opened_at: openedAt, closed_at: input.closed_at, stake: input.stake, pnl: fields.pnl, impulse: input.checklist.impulse },
      sessionTrades: siblings.map((t) => ({
        opened_at: t.opened_at,
        closed_at: t.closed_at,
        stake: t.stake,
        pnl: t.pnl,
        impulse: t.checklist?.impulse === true,
      })),
      sessionOpenedAt: session.opened_at,
      balance: toAccount(accountSnap).balance,
      rules,
      goalAmount: session.goal_amount,
    });

    const trade: TradeDoc = {
      ...fields,
      session_id: sid,
      session_date: date,
      account_id: accountSnap.id,
      created_at: now,
      violations: result.violations.map((v) => ({ id: randomUUID(), rule_type: v.ruleType, message: v.message, created_at: now })),
      attachments: [],
    };

    if (result.shouldBlock) {
      session = {
        ...session,
        status: "blocked",
        closed_at: now,
        blocked_reason:
          result.limits.find((l) => l.action === "block")?.message ??
          result.violations.find((v) => v.action === "block")?.message ??
          null,
      };
    }
    session.metrics = computeDayMetrics([...siblings.map((t) => toDailyTrade(t.id, t)), toDailyTrade(input.id, trade)]);

    tx.set(tradeRef, trade);
    tx.set(sessionRef, session);
    tx.update(accountRef, {
      pnl_total: round((accountDoc.pnl_total ?? 0) + trade.pnl, 2),
      last_trade_id: input.id,
    });

    return { ok: true, accountId: accountSnap.id, sessionStatus: session.status, violations: result.violations, limits: result.limits } as const;
  });
}

/**
 * Corrige una operación ya registrada. Recalcula lo derivado y el resumen del día; no vuelve a
 * pasar por las reglas (las violaciones registradas al guardarla se quedan).
 */
export async function reviseTrade(uid: string, input: TradeInput): Promise<{ ok: true; accountId: string } | { ok: false; code: "not_found" }> {
  const r = refs(db(), uid);
  const tradeRef = r.trades.doc(input.id);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(tradeRef);
    if (!snap.exists) return { ok: false, code: "not_found" } as const;
    const current = snap.data() as TradeDoc;
    const accountRef = r.accounts.doc(current.account_id);
    const sessionRef = r.sessions.doc(current.session_id);
    const [accountSnap, siblings] = await Promise.all([tx.get(accountRef), sessionTradeDocs(tx, uid, current.session_id)]);

    const fields = tradeFields(input, input.opened_at ?? current.opened_at);
    const updated: TradeDoc = { ...current, ...fields };
    const metrics = computeDayMetrics(siblings.map((t) => toDailyTrade(t.id, t.id === input.id ? updated : t)));

    tx.update(tradeRef, fields);
    tx.update(sessionRef, { metrics });
    if (accountSnap.exists) {
      const pnlTotal = (accountSnap.get("pnl_total") as number | undefined) ?? 0;
      tx.update(accountRef, { pnl_total: round(pnlTotal - current.pnl + fields.pnl, 2) });
    }
    return { ok: true, accountId: current.account_id } as const;
  });
}

export async function removeTrade(uid: string, id: string): Promise<{ ok: true; accountId: string } | { ok: false; code: "not_found" }> {
  const r = refs(db(), uid);
  const tradeRef = r.trades.doc(id);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(tradeRef);
    if (!snap.exists) return { ok: false, code: "not_found" } as const;
    const current = snap.data() as TradeDoc;
    const accountRef = r.accounts.doc(current.account_id);
    const [accountSnap, siblings] = await Promise.all([tx.get(accountRef), sessionTradeDocs(tx, uid, current.session_id)]);

    const metrics = computeDayMetrics(siblings.filter((t) => t.id !== id).map((t) => toDailyTrade(t.id, t)));
    tx.delete(tradeRef);
    tx.update(r.sessions.doc(current.session_id), { metrics });
    if (accountSnap.exists) {
      const a = accountSnap.data() as AccountDoc;
      tx.update(accountRef, {
        pnl_total: round((a.pnl_total ?? 0) - current.pnl, 2),
        ...(a.last_trade_id === id ? { last_trade_id: null } : {}),
      });
    }
    return { ok: true, accountId: current.account_id } as const;
  });
}
