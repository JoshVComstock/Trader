"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/data";
import { accountSchema, ruleSchema, strategySchema } from "@/lib/schemas";

function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function saveAccount(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = accountSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa la cuenta", "validation", zodFieldErrors(parsed.error.issues));
  const { id, ...values } = parsed.data;
  const { supabase, user } = await requireUser();

  if (id) {
    const { error } = await supabase.from("accounts").update(values).eq("id", id);
    if (error) return fail("No pudimos guardar la cuenta", "unknown");
    revalidateAll();
    return ok({ id });
  }

  const { data, error } = await supabase
    .from("accounts")
    .insert({ ...values, user_id: user.id })
    .select("id")
    .single();
  if (error) return fail("No pudimos crear la cuenta", "unknown");
  revalidateAll();
  return ok({ id: data.id });
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { count } = await supabase.from("trades").select("id", { count: "exact", head: true }).eq("account_id", id);
  if ((count ?? 0) > 0) {
    return fail("Esta cuenta tiene operaciones. Expórtalas antes; por ahora no se borra.", "validation");
  }
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) return fail("No pudimos borrar la cuenta", "unknown");
  revalidateAll();
  return ok(undefined);
}

export async function saveStrategy(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = strategySchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa la estrategia", "validation", zodFieldErrors(parsed.error.issues));
  const { id, ...values } = parsed.data;
  const { supabase, user } = await requireUser();

  if (id) {
    const { error } = await supabase.from("strategies").update(values).eq("id", id);
    if (error) return fail("No pudimos guardar la estrategia", "unknown");
    revalidateAll();
    return ok({ id });
  }
  const { data, error } = await supabase
    .from("strategies")
    .insert({ ...values, user_id: user.id })
    .select("id")
    .single();
  if (error) return fail("No pudimos crear la estrategia", "unknown");
  revalidateAll();
  return ok({ id: data.id });
}

export async function saveRule(raw: unknown): Promise<ActionResult> {
  const parsed = ruleSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa la regla", "validation", zodFieldErrors(parsed.error.issues));
  const rule = parsed.data;
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("rules")
    .upsert(
      { user_id: user.id, type: rule.type, params: rule.params, action: rule.action, enabled: rule.enabled },
      { onConflict: "user_id,type" },
    );
  if (error) return fail("No pudimos guardar la regla", "unknown");
  revalidateAll();
  return ok(undefined);
}
