"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { signedImageUrl } from "@/lib/cloudinary";
import { requireUser } from "@/lib/data";
import { PSYCH_FEATURES } from "@/lib/domain/psych";
import { observationSchema, userSettingsSchema, weeklyReviewSchema } from "@/lib/schemas";

function revalidateAll() {
  revalidatePath("/", "layout");
}

/** Prende o apaga funciones de control mental y guarda la frase de pausa. */
export async function saveUserSettings(raw: unknown): Promise<ActionResult> {
  const parsed = userSettingsSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa los ajustes", "validation", zodFieldErrors(parsed.error.issues));
  const known = new Set<string>(PSYCH_FEATURES.map((f) => f.key));
  const psych = Object.fromEntries(Object.entries(parsed.data.psych).filter(([k]) => known.has(k)));

  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: user.id,
      psych,
      pause_phrase: parsed.data.pause_phrase || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return fail("No pudimos guardar los ajustes", "unknown");
  revalidateAll();
  return ok(undefined);
}

export async function saveWeeklyReview(raw: unknown): Promise<ActionResult> {
  const parsed = weeklyReviewSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa tu respuesta", "validation", zodFieldErrors(parsed.error.issues));
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("weekly_reviews").upsert(
    {
      user_id: user.id,
      week_start: parsed.data.week_start,
      answer: parsed.data.answer,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,week_start" },
  );
  if (error) return fail("No pudimos guardar la revisión", "unknown");
  revalidateAll();
  return ok(undefined);
}

export async function saveObservation(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = observationSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa la observación", "validation", zodFieldErrors(parsed.error.issues));
  const { id, ...values } = parsed.data;
  const { supabase, user } = await requireUser();

  if (id) {
    const { error } = await supabase.from("observations").update(values).eq("id", id);
    if (error) return fail("No pudimos guardar la observación", "unknown");
    revalidateAll();
    return ok({ id });
  }
  const { data, error } = await supabase
    .from("observations")
    .insert({ ...values, user_id: user.id })
    .select("id")
    .single();
  if (error) return fail("No pudimos guardar la observación", "unknown");
  revalidateAll();
  return ok({ id: data.id });
}

/** "Se repitió": suma una vez más y actualiza cuándo la viste. */
export async function bumpObservation(id: string): Promise<ActionResult<{ times: number }>> {
  const { supabase } = await requireUser();
  const { data: current } = await supabase.from("observations").select("times_seen").eq("id", id).maybeSingle();
  if (!current) return fail("No encontramos esa observación", "not_found");
  const times = current.times_seen + 1;
  const { error } = await supabase
    .from("observations")
    .update({ times_seen: times, last_seen_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return fail("No pudimos actualizarla", "unknown");
  revalidateAll();
  return ok({ times });
}

export async function deleteObservation(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("observations").delete().eq("id", id);
  if (error) return fail("No pudimos borrarla", "unknown");
  revalidateAll();
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
  const { supabase } = await requireUser();
  const { data: session } = await supabase
    .from("sessions")
    .select("id, opened_at, closed_at, mood_before, planned_minutes, goal_r, read_rules, followed_plan, journal, status, blocked_reason")
    .eq("account_id", accountId)
    .eq("date", date)
    .maybeSingle();
  if (!session) return ok({ date, session: null, trades: [] });

  const { data: trades, error } = await supabase
    .from("trades")
    .select(
      "id, opened_at, closed_at, instrument, direction, with_spike, stake, entry_amount, multiplier, pnl, r_multiple, outcome, mood, note, in_plan, rule_violations(message), attachments(id, path, width, height)",
    )
    .eq("session_id", session.id)
    .order("opened_at");
  if (error) return fail("No pudimos leer ese día", "unknown");

  return ok({
    date,
    session: {
      opened_at: session.opened_at,
      closed_at: session.closed_at,
      mood_before: session.mood_before,
      planned_minutes: session.planned_minutes,
      goal_r: session.goal_r === null ? null : Number(session.goal_r),
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
      stake: Number(t.stake),
      entry_amount: t.entry_amount === null ? null : Number(t.entry_amount),
      multiplier: t.multiplier,
      pnl: Number(t.pnl),
      r_multiple: Number(t.r_multiple),
      outcome: t.outcome,
      mood: t.mood,
      note: t.note,
      in_plan: t.in_plan,
      violations: t.rule_violations.map((v) => v.message),
      shots: t.attachments.map((a) => ({ id: a.id, width: a.width, height: a.height, url: signedImageUrl(a.path) })),
    })),
  });
}
