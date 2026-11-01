import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next, error } = await searchParams;
  // Con una sesión válida no hay nada que hacer aquí. Una cookie caducada sí llega: se muestra el formulario.
  if (await currentUser()) redirect(typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/operar");
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-8 px-5 py-10">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium text-brand">
          <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17 L9 11 L13 15 L21 6" />
            <path d="M15 6 L21 6 L21 12" />
          </svg>
          Racha
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Tu bitácora de Boom y Crash</h1>
        <p className="text-sm text-muted-foreground">
          Registra cada operación en segundos y mira si estás respetando tus reglas.
        </p>
      </div>
      <LoginForm next={typeof next === "string" ? next : ""} initialError={typeof error === "string" ? error : undefined} />
    </main>
  );
}
