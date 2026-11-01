"use server";

import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { deleteTradeAssets } from "@/lib/cloudinary";
import { db } from "@/lib/db/admin";
import { invalidate } from "@/lib/db/invalidate";
import { recordTrade, removeTrade, reviseTrade } from "@/lib/db/ledger";
import { getProfile } from "@/lib/db/queries";
import { refs } from "@/lib/db/schema";
import { todayLocal } from "@/lib/data";
import type { LimitReached, Violation } from "@/lib/rules";
import { noteSchema, tradeInputSchema } from "@/lib/schemas";
import type { Session } from "@/lib/types";

function logError(e: unknown): null {
  console.error("[trades]", e);
  return null;
}

export interface CreateTradeResult {
  tradeId: string;
  sessionStatus: Session["status"];
  violations: Violation[];
  limits: LimitReached[];
}

/** Registra una operación (ver `recordTrade`: reglas, bloqueo, resumen del día y balance). */
export async function createTrade(raw: unknown): Promise<ActionResult<CreateTradeResult>> {
  const parsed = tradeInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("Revisa los campos marcados", "validation", zodFieldErrors(parsed.error.issues));
  }
  const input = parsed.data;
  const { uid } = await requireUser();
  const { rules } = await getProfile(uid);

  const res = await recordTrade(uid, input, rules, todayLocal()).catch(logError);
  if (!res) return fail("No pudimos guardar la operación. Reintenta.", "unknown");
  if (!res.ok) {
    switch (res.code) {
      case "not_found":
        return fail("No encontramos esa cuenta", "not_found");
      case "no_session":
        return fail("Antes de operar, haz el check-in de la sesión de hoy", "no_session");
      case "session_blocked":
        return fail("La sesión de hoy está bloqueada por tus reglas. Mañana se vuelve a abrir.", "session_blocked");
      case "session_closed":
        return fail("Cerraste la sesión de hoy. Se vuelve a abrir mañana.", "session_closed");
      case "validation":
        return fail(res.message, "validation", { [res.field]: res.message });
    }
  }

  invalidate.ledger(uid, res.accountId);
  return ok({ tradeId: input.id, sessionStatus: res.sessionStatus, violations: res.violations, limits: res.limits });
}

export async function updateTrade(raw: unknown): Promise<ActionResult<{ tradeId: string }>> {
  const parsed = tradeInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("Revisa los campos marcados", "validation", zodFieldErrors(parsed.error.issues));
  }
  const { uid } = await requireUser();
  const res = await reviseTrade(uid, parsed.data).catch(logError);
  if (!res) return fail("No pudimos guardar los cambios", "unknown");
  if (!res.ok) return fail("No encontramos esa operación", "not_found");

  invalidate.ledger(uid, res.accountId);
  return ok({ tradeId: parsed.data.id });
}

export async function updateTradeNote(raw: unknown): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(raw);
  if (!parsed.success) return fail("Nota inválida", "validation");
  const { uid } = await requireUser();
  const ref = refs(db(), uid).trades.doc(parsed.data.trade_id);
  const snap = await ref.get();
  if (!snap.exists) return fail("No encontramos esa operación", "not_found");
  await ref.update({ note: parsed.data.note || null });
  invalidate.ledger(uid, String(snap.get("account_id")), { balance: false });
  return ok(undefined);
}

export async function deleteTrade(id: string): Promise<ActionResult> {
  const { uid } = await requireUser();
  const res = await removeTrade(uid, id).catch(logError);
  if (!res) return fail("No pudimos borrar la operación", "unknown");
  if (!res.ok) return fail("No encontramos esa operación", "not_found");

  // Las capturas viven en Cloudinary: se borran aparte. Si falla, la operación ya no existe igual.
  await deleteTradeAssets(uid, id).catch(() => undefined);

  invalidate.ledger(uid, res.accountId);
  return ok(undefined);
}
