export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: ActionErrorCode; fieldErrors?: Record<string, string> };

export type ActionErrorCode =
  | "validation"
  | "unauthorized"
  | "not_found"
  | "no_session"
  | "session_blocked"
  | "session_closed"
  | "config"
  | "unknown";

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(
  error: string,
  code: ActionErrorCode = "unknown",
  fieldErrors?: Record<string, string>,
): { ok: false; error: string; code: ActionErrorCode; fieldErrors?: Record<string, string> } {
  return { ok: false, error, code, fieldErrors };
}

/** Errores de Zod → { campo: mensaje } con la primera falla de cada campo. */
export function zodFieldErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
