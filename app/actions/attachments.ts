"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import {
  cloudinaryConfigured,
  deleteAsset,
  fetchAsset,
  signUpload,
  signedImageUrl,
  tradePrefix,
  type SignedUpload,
} from "@/lib/cloudinary";
import { requireUser } from "@/lib/data";
import { attachmentSchema } from "@/lib/schemas";

async function ownsTrade(tradeId: string): Promise<{ userId: string } | null> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("trades").select("id").eq("id", tradeId).maybeSingle();
  return data ? { userId: user.id } : null;
}

/** Firma una subida para una operación propia. */
export async function prepareUpload(tradeId: string): Promise<ActionResult<SignedUpload>> {
  if (!cloudinaryConfigured()) {
    return fail("Las capturas necesitan Cloudinary configurado (ver README).", "config");
  }
  const owner = await ownsTrade(tradeId);
  if (!owner) return fail("No encontramos esa operación", "not_found");
  return ok(signUpload(owner.userId, tradeId));
}

/** Registra la captura ya subida. Las medidas se leen de Cloudinary, no del navegador. */
export async function saveAttachment(
  raw: unknown,
): Promise<ActionResult<{ id: string; url: string | null; width: number; height: number }>> {
  const parsed = attachmentSchema.safeParse(raw);
  if (!parsed.success) return fail("Captura inválida", "validation");
  const input = parsed.data;

  const { supabase, user } = await requireUser();
  if (!input.public_id.startsWith(tradePrefix(user.id, input.trade_id))) {
    return fail("Esa captura no es tuya", "unauthorized");
  }
  const owner = await ownsTrade(input.trade_id);
  if (!owner) return fail("No encontramos esa operación", "not_found");

  const asset = await fetchAsset(input.public_id);
  if (!asset) return fail("La captura no llegó a Cloudinary. Reintenta.", "unknown");

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      user_id: user.id,
      trade_id: input.trade_id,
      path: input.public_id,
      width: asset.width,
      height: asset.height,
      bytes: asset.bytes,
    })
    .select("id")
    .single();
  if (error) return fail("No pudimos guardar la captura", "unknown");

  revalidatePath(`/journal/${input.trade_id}`);
  return ok({ id: data.id, url: signedImageUrl(input.public_id), width: asset.width, height: asset.height });
}

export async function removeAttachment(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("attachments").select("id, path, trade_id").eq("id", id).maybeSingle();
  if (!data) return fail("No encontramos esa captura", "not_found");

  const { error } = await supabase.from("attachments").delete().eq("id", id);
  if (error) return fail("No pudimos borrar la captura", "unknown");
  await deleteAsset(data.path).catch(() => undefined);

  revalidatePath(`/journal/${data.trade_id}`);
  return ok(undefined);
}
