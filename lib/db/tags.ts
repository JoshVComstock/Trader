/**
 * Etiquetas de la caché de datos de Next. Cada lectura de Firestore se guarda con las suyas y
 * cada Server Action que escribe invalida solo las que tocó: Firestore se vuelve a leer
 * únicamente cuando algo cambió.
 */
export const tags = {
  /** Reglas, control mental y frase de pausa. */
  profile: (uid: string) => `u:${uid}:profile`,
  /** Lista de cuentas con sus balances. */
  accounts: (uid: string) => `u:${uid}:accounts`,
  strategies: (uid: string) => `u:${uid}:strategies`,
  /** Sesiones, operaciones y movimientos de una cuenta. */
  ledger: (uid: string, accountId: string) => `u:${uid}:ledger:${accountId}`,
  /** Lecturas que cruzan cuentas: revisión semanal, detalle de operación, historia del día. */
  ledgers: (uid: string) => `u:${uid}:ledgers`,
  observations: (uid: string) => `u:${uid}:observations`,
  reviews: (uid: string) => `u:${uid}:reviews`,
};
