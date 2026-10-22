"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { requireUser, todayLocal } from "@/lib/data";
import { checkinSchema, closeSessionSchema } from "@/lib/schemas";

function revalidateJournal() {
  revalidatePath("/journal", "layout");
  revalidatePath("/backtesting", "layout");
}

/** Check-in emocional: abre la sesión de hoy para una cuenta. */
export async function checkIn(raw: unknown): Promise<ActionResult<{ sessionId: string }>> {
  const parsed = checkinSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa el check-in", "validation", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;
  const { supabase, user } = await requireUser();

  const { data: account } = await supabase.from("accounts").select("id, kind").eq("id", input.account_id).maybeSingle();
  if (!account) return fail("No encontramos esa cuenta", "not_found");

  const date = todayLocal();
  const { data: existing } = await supabase
    .from("sessions")
    .select("id")
    .eq("account_id", account.id)
    .eq("date", date)
    .maybeSingle();
  if (existing) return ok({ sessionId: existing.id });

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: user.id,
      account_id: account.id,
      date,
      mood_before: input.mood_before,
      read_rules: input.read_rules,
      goal_r: input.goal_r,
      goal_amount: input.goal_amount,
      planned_minutes: input.planned_minutes,
    })
    .select("id")
    .single();
  if (error) return fail("No pudimos abrir la sesión", "unknown");

  revalidateJournal();
  return ok({ sessionId: data.id });
}

/** Cierre de sesión con reflexión. Es definitivo hasta mañana. Una bloqueada guarda la reflexión y sigue bloqueada. */
export async function closeSession(raw: unknown): Promise<ActionResult> {
  const parsed = closeSessionSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa el cierre", "validation", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;
  const { supabase } = await requireUser();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, status, closed_at")
    .eq("id", input.session_id)
    .maybeSingle();
  if (!session) return fail("No encontramos la sesión", "not_found");

  const { error } = await supabase
    .from("sessions")
    .update({
      followed_plan: input.followed_plan,
      journal: input.journal || null,
      status: session.status === "blocked" ? "blocked" : "closed",
      closed_at: session.closed_at ?? new Date().toISOString(),
    })
    .eq("id", session.id);
  if (error) return fail("No pudimos cerrar la sesión", "unknown");

  revalidateJournal();
  return ok(undefined);
}

/** Reabre una sesión cerrada a mano. Una bloqueada no se reabre: la base lo impide. */
/**
 * Una sesión cerrada en vivo no se reabre: se vuelve a operar mañana. La base lo impide también
 * (trigger `sessions_guard`), así que no se puede saltar llamando a la API directo.
 */
