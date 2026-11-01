"use server";

import { randomUUID } from "node:crypto";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import {
  cloudinaryConfigured,
  deleteAsset,
  fetchAsset,
  signUpload,
  signedImageUrl,
  tradePrefix,
  type SignedUpload,
} from "@/lib/cloudinary";
import { db } from "@/lib/db/admin";
import { invalidate } from "@/lib/db/invalidate";
import { refs, type TradeDoc } from "@/lib/db/schema";
import { attachmentSchema } from "@/lib/schemas";

/** Firma una subida para una operación propia. */
export async function prepareUpload(tradeId: string): Promise<ActionResult<SignedUpload>> {
  if (!cloudinaryConfigured()) {
    return fail("Las capturas necesitan Cloudinary configurado (ver README).", "config");
  }
  const { uid } = await requireUser();
  const trade = await refs(db(), uid).trades.doc(tradeId).get();
  if (!trade.exists) return fail("No encontramos esa operación", "not_found");
  return ok(signUpload(uid, tradeId));
}

/** Registra la captura ya subida. Las medidas se leen de Cloudinary, no del navegador. */
export async function saveAttachment(
  raw: unknown,
): Promise<ActionResult<{ id: string; url: string | null; width: number; height: number }>> {
  const parsed = attachmentSchema.safeParse(raw);
  if (!parsed.success) return fail("Captura inválida", "validation");
  const input = parsed.data;

  const { uid } = await requireUser();
  if (!input.public_id.startsWith(tradePrefix(uid, input.trade_id))) {
    return fail("Esa captura no es tuya", "unauthorized");
  }
  const asset = await fetchAsset(input.public_id);
  if (!asset) return fail("La captura no llegó a Cloudinary. Reintenta.", "unknown");

  const ref = refs(db(), uid).trades.doc(input.trade_id);
  const id = randomUUID();
  const accountId = await db()
    .runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const t = snap.data() as TradeDoc;
      // La misma captura dos veces (reintento) no se duplica.
      if (!(t.attachments ?? []).some((a) => a.path === input.public_id)) {
        tx.update(ref, {
          attachments: [
            ...(t.attachments ?? []),
            { id, path: input.public_id, width: asset.width, height: asset.height, bytes: asset.bytes, created_at: new Date().toISOString() },
          ],
        });
      }
      return t.account_id;
    })
    .catch(() => undefined);
  if (accountId === undefined) return fail("No pudimos guardar la captura", "unknown");
  if (accountId === null) return fail("No encontramos esa operación", "not_found");

  invalidate.ledger(uid, accountId, { balance: false });
  return ok({ id, url: signedImageUrl(input.public_id), width: asset.width, height: asset.height });
}

export async function removeAttachment(tradeId: string, id: string): Promise<ActionResult> {
  const { uid } = await requireUser();
  const ref = refs(db(), uid).trades.doc(tradeId);
  const removed = await db()
    .runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const t = snap.data() as TradeDoc;
      const shot = (t.attachments ?? []).find((a) => a.id === id);
      if (!shot) return null;
      tx.update(ref, { attachments: (t.attachments ?? []).filter((a) => a.id !== id) });
      return { path: shot.path, accountId: t.account_id };
    })
    .catch(() => undefined);
  if (removed === undefined) return fail("No pudimos borrar la captura", "unknown");
  if (removed === null) return fail("No encontramos esa captura", "not_found");
  await deleteAsset(removed.path).catch(() => undefined);

  invalidate.ledger(uid, removed.accountId, { balance: false });
  return ok(undefined);
}
