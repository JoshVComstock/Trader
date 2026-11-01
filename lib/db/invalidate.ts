import { updateTag } from "next/cache";
import { tags } from "./tags";

/**
 * Invalida la caché después de escribir (solo dentro de Server Actions). `updateTag` expira al
 * instante: la próxima lectura trae lo nuevo, así ves tu cambio enseguida.
 */
export const invalidate = {
  profile: (uid: string) => updateTag(tags.profile(uid)),
  strategies: (uid: string) => updateTag(tags.strategies(uid)),
  observations: (uid: string) => updateTag(tags.observations(uid)),
  reviews: (uid: string) => updateTag(tags.reviews(uid)),
  /** Algo cambió en una cuenta: sus sesiones/operaciones, su balance y las lecturas que cruzan cuentas. */
  ledger(uid: string, accountId: string, { balance = true }: { balance?: boolean } = {}) {
    updateTag(tags.ledger(uid, accountId));
    updateTag(tags.ledgers(uid));
    if (balance) updateTag(tags.accounts(uid));
  },
  accounts: (uid: string) => updateTag(tags.accounts(uid)),
};
