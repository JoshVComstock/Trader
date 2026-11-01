import type { DocumentReference } from "firebase-admin/firestore";
import { db } from "../lib/db/admin";
import { DEFAULT_RULES } from "../lib/db/defaults";
import { refs, type UserDoc } from "../lib/db/schema";
import type { Rule } from "../lib/rules";
import { parseRules } from "../lib/schemas";

/** Utilidades para los scripts (seed y migración). Escriben directo, sin la caché de Next. */

export interface Write {
  ref: DocumentReference;
  data: object;
}

/** Escribe documentos de a 400 (el límite de un batch es 500). */
export async function writeAll(writes: readonly Write[]): Promise<void> {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db().batch();
    for (const w of writes.slice(i, i + 400)) batch.set(w.ref, w.data);
    await batch.commit();
  }
}

/** Reglas del usuario leídas directo. */
export async function getProfileRules(uid: string): Promise<Rule[]> {
  const snap = await refs(db(), uid).user.get();
  const rules = { ...DEFAULT_RULES, ...((snap.data() as Partial<UserDoc> | undefined)?.rules ?? {}) };
  return parseRules(Object.entries(rules).map(([type, r]) => ({ type, ...r })));
}

/** Borra una cuenta con sus sesiones, operaciones y movimientos. */
export async function deleteAccountData(uid: string, accountId: string): Promise<void> {
  const r = refs(db(), uid);
  const [sessions, trades, cash] = await Promise.all([
    r.sessions.where("account_id", "==", accountId).get(),
    r.trades.where("account_id", "==", accountId).get(),
    r.cashflows.where("account_id", "==", accountId).get(),
  ]);
  const refsToDelete = [...sessions.docs, ...trades.docs, ...cash.docs].map((d) => d.ref);
  refsToDelete.push(r.accounts.doc(accountId));
  for (let i = 0; i < refsToDelete.length; i += 400) {
    const batch = db().batch();
    for (const ref of refsToDelete.slice(i, i + 400)) batch.delete(ref);
    await batch.commit();
  }
}
