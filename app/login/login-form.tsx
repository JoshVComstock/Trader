"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, { error: initialError });
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, {});
  const state = mode === "in" ? inState : upState;
  const pending = inPending || upPending;

  return (
    <form action={mode === "in" ? inAction : upAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          minLength={8}
          required
          className="h-11"
        />
        {mode === "up" && <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>}
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-loss/10 px-3 py-2 text-sm text-loss">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-foreground">
          {state.message}
        </p>
      )}

      <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
        {pending ? "Un momento…" : mode === "in" ? "Entrar" : "Crear cuenta"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "in" ? "¿Primera vez?" : "¿Ya tienes cuenta?"}{" "}
        <button
          type="button"
          className="font-medium text-foreground underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in" ? "Crea tu cuenta" : "Entra"}
        </button>
      </p>
    </form>
  );
}
