"use server";

import { ok, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db/admin";
import { invalidate } from "@/lib/db/invalidate";
import { refs } from "@/lib/db/schema";

/**
 * Tira la caché de todos tus datos: la próxima visita lee Firestore de nuevo.
 * Solo hace falta si se escribió por fuera de la app (seed, migración, consola de Firebase).
 */
export async function refreshMyData(): Promise<ActionResult> {
  const { uid } = await requireUser();
  const accounts = await refs(db(), uid).accounts.select().get();
  invalidate.profile(uid);
  invalidate.strategies(uid);
  invalidate.observations(uid);
  invalidate.reviews(uid);
  invalidate.accounts(uid);
  for (const a of accounts.docs) invalidate.ledger(uid, a.id);
  return ok(undefined);
}
