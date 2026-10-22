"use server";

import { revalidatePath } from "next/cache";
import { deriveTrade, defaultPnl, round } from "@/lib/calc/trade";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { requireUser, listRules, todayLocal, type Session } from "@/lib/data";
import { modeForKind } from "@/lib/domain/types";
import { deleteTradeAssets } from "@/lib/cloudinary";
import { evaluateTrade, type LimitReached, type Violation } from "@/lib/rules";
import { noteSchema, tradeInputSchema, type TradeInput } from "@/lib/schemas";
import { localDate } from "@/lib/time-core";

export interface CreateTradeResult {
  tradeId: string;
  sessionStatus: Session["status"];
  violations: Violation[];
  limits: LimitReached[];
}

function revalidateJournal() {
  revalidatePath("/journal", "layout");
  revalidatePath("/backtesting", "layout");
}

function lockedError(message: string | undefined) {
  if (message?.includes("SESSION_BLOCKED")) {
    return fail("La sesión de hoy está bloqueada por tus reglas. Mañana se vuelve a abrir.", "session_blocked");
  }
  if (message?.includes("SESSION_CLOSED")) {
    return fail("Cerraste la sesión de hoy. Se vuelve a abrir mañana.", "session_closed");
  }
  return null;
}

/** P/L final: el que escribió el usuario o el que dicta el SL/TP fijo. */
function resolvePnl(input: TradeInput): number {
  return input.pnl ?? defaultPnl(input.result, input.stake, input.tp);
}

/**
 * Registra una operación. El motor de reglas corre aquí otra vez porque el cliente no es confiable.
 * Si se rompe una regla `block`, la operación se guarda igual, la violación queda registrada
 * y la sesión pasa a `blocked`. La base rechaza cualquier operación nueva en una sesión bloqueada.
 */
export async function createTrade(raw: unknown): Promise<ActionResult<CreateTradeResult>> {
  const parsed = tradeInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("Revisa los campos marcados", "validation", zodFieldErrors(parsed.error.issues));
  }
  const input = parsed.data;
  const { supabase, user } = await requireUser();

  // Reintento de una operación que ya se guardó: no se duplica.
  const existing = await supabase.from("trades").select("id, session_id").eq("id", input.id).maybeSingle();
  if (existing.data) {
    const s = await supabase.from("sessions").select("status").eq("id", existing.data.session_id).single();
    return ok({ tradeId: input.id, sessionStatus: s.data?.status ?? "open", violations: [], limits: [] });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id, kind, start_balance")
    .eq("id", input.account_id)
    .maybeSingle();
  if (!account) return fail("No encontramos esa cuenta", "not_found");

  const mode = modeForKind(account.kind);
  const now = new Date().toISOString();
  const openedAt = input.opened_at ?? now;

  if (mode === "backtest" && !input.opened_at) {
    return fail("En backtesting indica la fecha y hora de la operación", "validation", {
      opened_at: "Obligatorio en backtesting",
    });
  }
  if (mode === "live" && Date.parse(openedAt) > Date.now() + 5 * 60_000) {
    return fail("La hora de apertura está en el futuro", "validation", { opened_at: "Está en el futuro" });
  }

  // Sesión: en vivo es la de hoy (con check-in); en backtesting se crea por día de la operación.
  const date = mode === "live" ? todayLocal() : localDate(openedAt);
  let { data: session } = await supabase
    .from("sessions")
    .select("id, opened_at, status, goal_amount")
    .eq("account_id", account.id)
    .eq("date", date)
    .maybeSingle();

  if (!session) {
    if (mode === "live") {
      return fail("Antes de operar, haz el check-in de la sesión de hoy", "no_session");
    }
    const created = await supabase
      .from("sessions")
      .insert({ account_id: account.id, user_id: user.id, date, opened_at: openedAt })
      .select("id, opened_at, status, goal_amount")
      .single();
    if (created.error) return fail("No pudimos abrir la sesión de backtesting", "unknown");
    session = created.data;
  } else if (mode === "backtest" && Date.parse(openedAt) < Date.parse(session.opened_at) && session.status === "open") {
    // Registrar una operación anterior mueve el inicio de la sesión de backtesting.
    await supabase.from("sessions").update({ opened_at: openedAt }).eq("id", session.id);
    session = { ...session, opened_at: openedAt };
  }

  // En backtesting no se cierra la sesión a mano: un día cerrado se reabre para seguir cargando datos.
  if (mode === "backtest" && session.status === "closed") {
    await supabase.from("sessions").update({ status: "open", closed_at: null }).eq("id", session.id);
    session = { ...session, status: "open" };
  }
  if (session.status === "blocked") return lockedError("SESSION_BLOCKED")!;
  if (session.status === "closed") return lockedError("SESSION_CLOSED")!;

  const [sessionTradesRes, dailyRes, rules] = await Promise.all([
    supabase.from("trades").select("opened_at, closed_at, stake, pnl, checklist").eq("session_id", session.id),
    supabase.from("metrics_daily").select("pnl").eq("account_id", account.id),
    listRules(supabase),
  ]);
  if (sessionTradesRes.error || dailyRes.error) return fail("No pudimos leer la sesión", "unknown");

  const balance = round(
    dailyRes.data.reduce((acc, d) => acc + Number(d.pnl), Number(account.start_balance)),
    2,
  );
  const pnl = resolvePnl(input);
  const derived = deriveTrade({
    instrument: input.instrument,
    direction: input.direction,
    stake: input.stake,
    pnl,
    checklist: input.checklist,
  });

  const result = evaluateTrade({
    candidate: {
      opened_at: openedAt,
      closed_at: input.closed_at,
      stake: input.stake,
      pnl,
      impulse: input.checklist.impulse,
    },
    sessionTrades: sessionTradesRes.data.map((t) => ({
      opened_at: t.opened_at,
      closed_at: t.closed_at,
      stake: Number(t.stake),
      pnl: Number(t.pnl),
      impulse: (t.checklist as Record<string, unknown> | null)?.impulse === true,
    })),
    sessionOpenedAt: session.opened_at,
    balance,
    rules,
    goalAmount: session.goal_amount === null ? null : Number(session.goal_amount),
  });

  const inserted = await supabase.from("trades").insert({
    id: input.id,
    user_id: user.id,
    session_id: session.id,
    account_id: account.id,
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
    ...derived,
  });
  if (inserted.error) {
    return lockedError(inserted.error.message) ?? fail("No pudimos guardar la operación. Reintenta.", "unknown");
  }

  if (result.violations.length > 0) {
    await supabase.from("rule_violations").insert(
      result.violations.map((v) => ({
        user_id: user.id,
        trade_id: input.id,
        session_id: session.id,
        rule_type: v.ruleType,
        message: v.message,
      })),
    );
  }

  let sessionStatus: Session["status"] = session.status;
  if (result.shouldBlock) {
    const reason =
      result.limits.find((l) => l.action === "block")?.message ??
      result.violations.find((v) => v.action === "block")?.message ??
      null;
    await supabase
      .from("sessions")
      .update({ status: "blocked", closed_at: now, blocked_reason: reason })
      .eq("id", session.id);
    sessionStatus = "blocked";
  }

  revalidateJournal();
  return ok({ tradeId: input.id, sessionStatus, violations: result.violations, limits: result.limits });
}

/**
 * Corrige una operación ya registrada. Recalcula lo derivado; no vuelve a pasar por las reglas
 * (las violaciones registradas al guardarla se quedan).
 */
export async function updateTrade(raw: unknown): Promise<ActionResult<{ tradeId: string }>> {
  const parsed = tradeInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("Revisa los campos marcados", "validation", zodFieldErrors(parsed.error.issues));
  }
  const input = parsed.data;
  const { supabase } = await requireUser();

  const { data: current } = await supabase.from("trades").select("id, opened_at").eq("id", input.id).maybeSingle();
  if (!current) return fail("No encontramos esa operación", "not_found");

  const pnl = resolvePnl(input);
  const { error } = await supabase
    .from("trades")
    .update({
      strategy_id: input.strategy_id,
      instrument: input.instrument,
      direction: input.direction,
      opened_at: input.opened_at ?? current.opened_at,
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
      ...deriveTrade({
        instrument: input.instrument,
        direction: input.direction,
        stake: input.stake,
        pnl,
        checklist: input.checklist,
      }),
    })
    .eq("id", input.id);
  if (error) return fail("No pudimos guardar los cambios", "unknown");

  revalidateJournal();
  return ok({ tradeId: input.id });
}

export async function updateTradeNote(raw: unknown): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(raw);
  if (!parsed.success) return fail("Nota inválida", "validation");
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("trades")
    .update({ note: parsed.data.note || null })
    .eq("id", parsed.data.trade_id);
  if (error) return fail("No pudimos guardar la nota", "unknown");
  revalidateJournal();
  return ok(undefined);
}

export async function deleteTrade(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data: trade } = await supabase.from("trades").select("id").eq("id", id).maybeSingle();
  if (!trade) return fail("No encontramos esa operación", "not_found");

  const { error } = await supabase.from("trades").delete().eq("id", id);
  if (error) return fail("No pudimos borrar la operación", "unknown");

  // Las capturas viven en Cloudinary: se borran aparte. Si falla, la operación ya no existe igual.
  await deleteTradeAssets(user.id, id).catch(() => undefined);

  revalidateJournal();
  return ok(undefined);
}
