"use server";

import { randomUUID } from "node:crypto";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { signedImageUrl } from "@/lib/cloudinary";
import { db } from "@/lib/db/admin";
import { invalidate } from "@/lib/db/invalidate";
import { getDay } from "@/lib/db/queries";
import { refs, type ObservationDoc, type WeeklyReviewDoc } from "@/lib/db/schema";
import { PSYCH_FEATURES } from "@/lib/domain/psych";
import { observationSchema, userSettingsSchema, weeklyReviewSchema } from "@/lib/schemas";

/** Prende o apaga funciones de control mental y guarda la frase de pausa. */
export async function saveUserSettings(raw: unknown): Promise<ActionResult> {
  const parsed = userSettingsSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa los ajustes", "validation", zodFieldErrors(parsed.error.issues));
  const known = new Set<string>(PSYCH_FEATURES.map((f) => f.key));
  const psych = Object.fromEntries(Object.entries(parsed.data.psych).filter(([k]) => known.has(k)));

  const { uid } = await requireUser();
  try {
    await refs(db(), uid).user.set(
      { psych, pause_phrase: parsed.data.pause_phrase || null, updated_at: new Date().toISOString() },
      { merge: true },
    );
  } catch (e) {
    console.error("[saveUserSettings]", e);
    return fail("No pudimos guardar los ajustes", "unknown");
  }
  invalidate.profile(uid);
  return ok(undefined);
}

export async function saveWeeklyReview(raw: unknown): Promise<ActionResult> {
  const parsed = weeklyReviewSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa tu respuesta", "validation", zodFieldErrors(parsed.error.issues));
  const { uid } = await requireUser();
  const ref = refs(db(), uid).reviews.doc(parsed.data.week_start);
  const now = new Date().toISOString();
  try {
    const existing = await ref.get();
    const doc: WeeklyReviewDoc = {
      week_start: parsed.data.week_start,
      answer: parsed.data.answer,
      created_at: (existing.get("created_at") as string | undefined) ?? now,
      updated_at: now,
    };
    await ref.set(doc);
  } catch (e) {
    console.error("[saveWeeklyReview]", e);
    return fail("No pudimos guardar la revisión", "unknown");
  }
  invalidate.reviews(uid);
  return ok(undefined);
}

export async function saveObservation(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = observationSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa la observación", "validation", zodFieldErrors(parsed.error.issues));
  const { id, ...values } = parsed.data;
  const { uid } = await requireUser();
  const col = refs(db(), uid).observations;

  try {
    if (id) {
      await col.doc(id).update(values);
      invalidate.observations(uid);
      return ok({ id });
    }
    const now = new Date().toISOString();
    const newId = randomUUID();
    const doc: ObservationDoc = { ...values, times_seen: 1, last_seen_at: now, created_at: now };
    await col.doc(newId).set(doc);
    invalidate.observations(uid);
    return ok({ id: newId });
  } catch (e) {
    console.error("[saveObservation]", e);
    return fail("No pudimos guardar la observación", "unknown");
  }
}

/** "Se repitió": suma una vez más y actualiza cuándo la viste. */
export async function bumpObservation(id: string): Promise<ActionResult<{ times: number }>> {
  const { uid } = await requireUser();
  const ref = refs(db(), uid).observations.doc(id);
  const times = await db()
    .runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const next = ((snap.get("times_seen") as number | undefined) ?? 1) + 1;
      tx.update(ref, { times_seen: next, last_seen_at: new Date().toISOString() });
      return next;
    })
    .catch(() => undefined);
  if (times === undefined) return fail("No pudimos actualizarla", "unknown");
  if (times === null) return fail("No encontramos esa observación", "not_found");
  invalidate.observations(uid);
  return ok({ times });
}

export async function deleteObservation(id: string): Promise<ActionResult> {
  const { uid } = await requireUser();
  try {
    await refs(db(), uid).observations.doc(id).delete();
  } catch {
    return fail("No pudimos borrarla", "unknown");
  }
  invalidate.observations(uid);
  return ok(undefined);
}

export interface DayStory {
  date: string;
  session: {
    opened_at: string;
    closed_at: string | null;
    mood_before: string | null;
    planned_minutes: number | null;
    goal_r: number | null;
    read_rules: boolean;
    followed_plan: boolean | null;
    journal: string | null;
    status: "open" | "closed" | "blocked";
    blocked_reason: string | null;
  } | null;
  trades: {
    id: string;
    opened_at: string;
    closed_at: string | null;
    instrument: string;
    direction: "buy" | "sell";
    with_spike: boolean;
    stake: number;
    entry_amount: number | null;
    multiplier: number | null;
    pnl: number;
    r_multiple: number;
    outcome: "win" | "loss" | "tie";
    mood: string | null;
    note: string | null;
    in_plan: boolean;
    violations: string[];
    shots: { id: string; url: string | null; width: number; height: number }[];
  }[];
}

/** Todo lo que pasó un día en una cuenta: el check-in, cada operación con su foto y nota, y el cierre. */
export async function getDayStory(accountId: string, date: string): Promise<ActionResult<DayStory>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Fecha inválida", "validation");
  const { uid } = await requireUser();
  const day = await getDay(uid, accountId, date).catch(() => null);
  if (!day) return fail("No pudimos leer ese día", "unknown");
  const { session, trades } = day;
  if (!session) return ok({ date, session: null, trades: [] });

  return ok({
    date,
    session: {
      opened_at: session.opened_at,
      closed_at: session.closed_at,
      mood_before: session.mood_before,
      planned_minutes: session.planned_minutes,
      goal_r: session.goal_r,
      read_rules: session.read_rules,
      followed_plan: session.followed_plan,
      journal: session.journal,
      status: session.status,
      blocked_reason: session.blocked_reason,
    },
    trades: trades.map((t) => ({
      id: t.id,
      opened_at: t.opened_at,
      closed_at: t.closed_at,
      instrument: t.instrument,
      direction: t.direction,
      with_spike: t.with_spike,
      stake: t.stake,
      entry_amount: t.entry_amount,
      multiplier: t.multiplier,
      pnl: t.pnl,
      r_multiple: t.r_multiple,
      outcome: t.outcome,
      mood: t.mood,
      note: t.note,
      in_plan: t.in_plan,
      violations: t.violation_messages,
      // Los enlaces firmados caducan: se firman al pedir el día, no se guardan en la caché.
      shots: t.shots.map((a) => ({ id: a.id, width: a.width, height: a.height, url: signedImageUrl(a.path) })),
    })),
  });
}
