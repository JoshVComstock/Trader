"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthError, endSession, passwordAuth, startSession, type AuthErrorCode } from "@/lib/auth";
import { ensureUserProfile } from "@/lib/db/bootstrap";

const credentialsSchema = z.object({
  email: z.email("Escribe un email válido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

export interface AuthState {
  error?: string;
  message?: string;
}

const MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: "Email o contraseña incorrectos.",
  email_exists: "Ya existe una cuenta con ese email. Entra con tu contraseña.",
  weak_password: "La contraseña es muy débil. Usa al menos 8 caracteres.",
  too_many_attempts: "Demasiados intentos. Espera unos minutos y vuelve a probar.",
  unknown: "No pudimos conectar con el servidor de cuentas. Intenta de nuevo.",
};

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/operar";
}

async function authenticate(
  method: "signInWithPassword" | "signUp",
  formData: FormData,
): Promise<{ error: string } | { created: boolean }> {
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos" };
  try {
    const { idToken, uid, email } = await passwordAuth(method, parsed.data.email, parsed.data.password);
    await startSession(idToken);
    // El perfil (reglas por defecto y una estrategia) se crea la primera vez que entra.
    const created = await ensureUserProfile(uid, email);
    return { created };
  } catch (e) {
    if (e instanceof AuthError) return { error: MESSAGES[e.code] };
    console.error("[auth]", e);
    return { error: MESSAGES.unknown };
  }
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const res = await authenticate("signInWithPassword", formData);
  if ("error" in res) return res;
  redirect(res.created ? "/ajustes?bienvenida=1" : safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const res = await authenticate("signUp", formData);
  if ("error" in res) return res;
  redirect("/ajustes?bienvenida=1");
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
