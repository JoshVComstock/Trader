import { randomUUID } from "node:crypto";
import { db } from "./admin";
import { DEFAULT_RULES, defaultStrategy } from "./defaults";
import { refs, type UserDoc } from "./schema";

/**
 * Crea el perfil del usuario con sus reglas y una estrategia la primera vez que entra.
 * Es idempotente: si el perfil ya existe no toca nada. Devuelve true si lo creó.
 */
export async function ensureUserProfile(uid: string, email: string | null): Promise<boolean> {
  const r = refs(db(), uid);
  const now = new Date().toISOString();
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(r.user);
    if (snap.exists) return false;
    const profile: UserDoc = { email, created_at: now, psych: {}, pause_phrase: null, rules: DEFAULT_RULES };
    tx.set(r.user, profile);
    tx.set(r.strategies.doc(randomUUID()), defaultStrategy(now));
    return true;
  });
}
