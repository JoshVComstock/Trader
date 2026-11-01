import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { adminAuth } from "@/lib/db/admin";
import { SESSION_COOKIE } from "@/lib/auth-cookie";
import { firebaseWebApiKey } from "@/lib/env";

/**
 * Sesión con Firebase Auth sin cargar el SDK de Firebase en el navegador:
 * el servidor valida email y contraseña contra la API de Identity Toolkit y guarda una
 * cookie de sesión de Firebase (httpOnly). Verificarla es local (firma con claves públicas
 * en caché), así que cada página no paga una ida a la red para saber quién eres.
 */
const SESSION_DAYS = 14;

export interface SessionUser {
  uid: string;
  email: string | null;
}

function identityUrl(method: "signInWithPassword" | "signUp"): string {
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const base = emulator ? `http://${emulator}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com";
  return `${base}/v1/accounts:${method}?key=${firebaseWebApiKey()}`;
}

export type AuthErrorCode = "invalid_credentials" | "email_exists" | "weak_password" | "too_many_attempts" | "unknown";

export class AuthError extends Error {
  constructor(public code: AuthErrorCode) {
    super(code);
  }
}

function mapIdentityError(message: string): AuthErrorCode {
  if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|USER_DISABLED|INVALID_EMAIL/.test(message)) {
    return "invalid_credentials";
  }
  if (message.includes("EMAIL_EXISTS")) return "email_exists";
  if (message.includes("WEAK_PASSWORD")) return "weak_password";
  if (message.includes("TOO_MANY_ATTEMPTS")) return "too_many_attempts";
  return "unknown";
}

/** Email y contraseña → idToken de Firebase. `signUp` crea la cuenta. */
export async function passwordAuth(
  method: "signInWithPassword" | "signUp",
  email: string,
  password: string,
): Promise<{ idToken: string; uid: string; email: string | null }> {
  const res = await fetch(identityUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as {
    idToken?: string;
    localId?: string;
    email?: string;
    error?: { message?: string };
  };
  if (!res.ok || !body.idToken || !body.localId) {
    throw new AuthError(mapIdentityError(body.error?.message ?? ""));
  }
  return { idToken: body.idToken, uid: body.localId, email: body.email ?? email };
}

/** Cambia el idToken por una cookie de sesión de 14 días. */
export async function startSession(idToken: string): Promise<void> {
  const expiresIn = SESSION_DAYS * 24 * 60 * 60 * 1000;
  const value = await adminAuth().createSessionCookie(idToken, { expiresIn });
  (await cookies()).set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: expiresIn / 1000,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Usuario de la cookie, o null si no hay o caducó. Deduplicado por petición. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    const claims = await adminAuth().verifySessionCookie(value);
    return { uid: claims.uid, email: claims.email ?? null };
  } catch {
    return null;
  }
});

/** Usuario autenticado. Redirige al login si no hay sesión válida. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
