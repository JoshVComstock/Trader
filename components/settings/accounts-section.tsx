"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteAccount, saveAccount } from "@/app/actions/settings";
import { Choice, FieldError, FieldLabel } from "@/components/app/choice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Account } from "@/lib/data";
import { ACCOUNT_KIND_LABEL, ACCOUNT_KINDS, type AccountKind } from "@/lib/domain/types";
import { money } from "@/lib/format";
import { accountSchema } from "@/lib/schemas";
import { zodFieldErrors } from "@/lib/action-result";

interface Draft {
  id?: string;
  label: string;
  kind: AccountKind;
  currency: string;
  start_balance: string;
}

function toDraft(a?: Account, kind: AccountKind = "real"): Draft {
  return a
    ? { id: a.id, label: a.label, kind: a.kind, currency: a.currency, start_balance: String(a.start_balance).replace(".", ",") }
    : { label: kind === "backtest" ? "Backtesting" : "Deriv", kind, currency: "USD", start_balance: kind === "backtest" ? "500" : "250" };
}

export function AccountsSection({ accounts, openNew }: { accounts: Account[]; openNew: AccountKind | null }) {
  const [editing, setEditing] = useState<Draft | null>(openNew ? toDraft(undefined, openNew) : null);

  return (
    <section id="cuentas" className="scroll-mt-20 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cuentas</h2>
          <p className="text-sm text-muted-foreground">Real y demo van a la bitácora. Backtesting tiene su propia sección, sin dinero real.</p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(toDraft())}>
            <PlusIcon />
            Nueva
          </Button>
        )}
      </div>

      <ul className="divide-y rounded-xl border bg-card">
        {accounts.length === 0 && !editing && (
          <li className="px-4 py-4 text-sm text-muted-foreground">Crea tu primera cuenta para empezar a registrar.</li>
        )}
        {accounts.map((a) =>
          editing?.id === a.id ? (
            <li key={a.id} className="p-4">
              <AccountForm draft={editing} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{a.label}</p>
                <p className="num text-xs text-muted-foreground">
                  {ACCOUNT_KIND_LABEL[a.kind]} · inicial {money(a.start_balance, a.currency)}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(toDraft(a))}>
                Editar
              </Button>
            </li>
          ),
        )}
        {editing && !editing.id && (
          <li className="p-4">
            <AccountForm draft={editing} onDone={() => setEditing(null)} />
          </li>
        )}
      </ul>
    </section>
  );
}

function AccountForm({ draft: initial, onDone }: { draft: Draft; onDone: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function submit() {
    const payload = {
      id: draft.id,
      label: draft.label,
      kind: draft.kind,
      currency: draft.currency,
      start_balance: Number(draft.start_balance.replace(",", ".")),
    };
    const parsed = accountSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error.issues));
      return;
    }
    start(async () => {
      const res = await saveAccount(parsed.data);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(draft.id ? "Cuenta guardada" : "Cuenta creada");
      onDone();
    });
  }

  function remove() {
    if (!draft.id) return;
    start(async () => {
      const res = await deleteAccount(draft.id!);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Cuenta borrada");
      onDone();
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel>Nombre</FieldLabel>
          <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="h-10" />
          <FieldError message={errors.label} />
        </div>
        <div>
          <FieldLabel>Tipo</FieldLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {ACCOUNT_KINDS.map((k) => (
              <Choice key={k} selected={draft.kind === k} onClick={() => setDraft({ ...draft, kind: k })}>
                {ACCOUNT_KIND_LABEL[k]}
              </Choice>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Balance inicial</FieldLabel>
          <Input
            value={draft.start_balance}
            onChange={(e) => setDraft({ ...draft, start_balance: e.target.value })}
            inputMode="decimal"
            className="num h-10"
          />
          <FieldError message={errors.start_balance} />
        </div>
        <div>
          <FieldLabel>Moneda</FieldLabel>
          <Input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} maxLength={3} className="num h-10 w-24 uppercase" />
          <FieldError message={errors.currency} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        {draft.id ? (
          <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>
            <Trash2Icon />
            Borrar
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : draft.id ? "Guardar" : "Crear cuenta"}
          </Button>
        </div>
      </div>
    </form>
  );
}
