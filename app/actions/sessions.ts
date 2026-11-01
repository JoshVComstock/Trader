"use server";

import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db/admin";
import { invalidate } from "@/lib/db/invalidate";
import { refs, sessionId, type SessionDoc } from "@/lib/db/schema";
import { todayLocal } from "@/lib/data";
import { checkinSchema, closeSessionSchema } from "@/lib/schemas";

/** Check-in emocional: abre la sesión de hoy para una cuenta. Si ya existe, no la toca. */
export async function checkIn(raw: unknown): Promise<ActionResult<{ sessionId: string }>> {
  const parsed = checkinSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa el check-in", "validation", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;
  const { uid } = await requireUser();
  const r = refs(db(), uid);

  const account = await r.accounts.doc(input.account_id).get();
  if (!account.exists) return fail("No encontramos esa cuenta", "not_found");

  const date = todayLocal();
  const id = sessionId(account.id, date);
  const now = new Date().toISOString();
  const session: SessionDoc = {
    account_id: account.id,
    date,
    opened_at: now,
    closed_at: null,
    mood_before: input.mood_before,
    read_rules: input.read_rules,
    goal_r: input.goal_r,
    followed_plan: null,
    journal: null,
    status: "open",
    blocked_reason: null,
    planned_minutes: input.planned_minutes,
    goal_amount: input.goal_amount,
    created_at: now,
    metrics: null,
  };
  try {
    // `create` falla si ya existe: dos check-ins el mismo día no pisan la sesión.
    await r.sessions.doc(id).create(session);
  } catch (e) {
    if ((e as { code?: number }).code !== 6) {
      console.error("[checkIn]", e);
      return fail("No pudimos abrir la sesión", "unknown");
    }
  }

  invalidate.ledger(uid, account.id, { balance: false });
  return ok({ sessionId: id });
}

/**
 * Cierre de sesión con reflexión. En vivo es definitivo hasta mañana (registrar en una sesión
 * cerrada se rechaza en la transacción). Una bloqueada guarda la reflexión y sigue bloqueada.
 */
export async function closeSession(raw: unknown): Promise<ActionResult> {
  const parsed = closeSessionSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa el cierre", "validation", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;
  const { uid } = await requireUser();
  const r = refs(db(), uid);
  const ref = r.sessions.doc(input.session_id);

  const accountId = await db()
    .runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const s = snap.data() as SessionDoc;
      tx.update(ref, {
        followed_plan: input.followed_plan,
        journal: input.journal || null,
        status: s.status === "blocked" ? "blocked" : "closed",
        closed_at: s.closed_at ?? new Date().toISOString(),
      });
      return s.account_id;
    })
    .catch((e: unknown) => {
      console.error("[closeSession]", e);
      return undefined;
    });
  if (accountId === undefined) return fail("No pudimos cerrar la sesión", "unknown");
  if (accountId === null) return fail("No encontramos la sesión", "not_found");

  invalidate.ledger(uid, accountId, { balance: false });
  return ok(undefined);
}

