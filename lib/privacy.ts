/** Modo privado: tapa los montos con ****. Se guarda en una cookie para que el servidor ya lo pinte. */
export const PRIVACY_COOKIE = "privacy";

export function parsePrivacy(value: string | null | undefined): boolean {
  return value === "1";
}
