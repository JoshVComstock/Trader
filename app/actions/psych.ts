"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
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
