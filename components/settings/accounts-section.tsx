"use client";

import { PlusIcon, Trash2Icon, WalletIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteAccount, saveAccount } from "@/app/actions/settings";
import { FieldError, FieldLabel } from "@/components/app/choice";
import { InputGroup, Segmented } from "@/components/app/input-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { zodFieldErrors } from "@/lib/action-result";
import type { Account } from "@/lib/data";
import { ACCOUNT_KIND_LABEL, ACCOUNT_KINDS, type AccountKind } from "@/lib/domain/types";
import { money, signedMoney } from "@/lib/format";
import { accountSchema } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";
import { Private } from "@/components/app/private";

interface Draft {
  id?: string;
  label: string;
  kind: AccountKind;
  start_balance: string;
}

function toDraft(a?: Account, kind: AccountKind = "real"): Draft {
  return a
    ? { id: a.id, label: a.label, kind: a.kind, start_balance: String(a.start_balance) }
    : { label: kind === "backtest" ? "Backtesting" : "Deriv", kind, start_balance: kind === "backtest" ? "500" : "250" };
}

/** "Inicial $21 · operaciones +$5 · retiros −$3": de dónde sale el balance. */
function balanceBreakdown(a: Account): string {
  const parts = [`Inicial ${money(a.start_balance, "USD")}`, `operaciones ${signedMoney(a.pnl_total, "USD")}`];
  if (a.deposits_total > 0) parts.push(`depósitos +${money(a.deposits_total, "USD")}`);
  if (a.withdrawals_total > 0) parts.push(`retiros −${money(a.withdrawals_total, "USD")}`);
  return parts.join(" · ");
}

const KIND_OPTIONS = ACCOUNT_KINDS.map((k) => ({ value: k, label: ACCOUNT_KIND_LABEL[k] }));

const KIND_BADGE: Record<AccountKind, string> = {
  real: "bg-foreground/10 text-foreground",
  demo: "bg-muted text-muted-foreground",
  backtest: "bg-brand/15 text-brand",
};

export function AccountsSection({ accounts, openNew }: { accounts: Account[]; openNew: AccountKind | null }) {
  const [editing, setEditing] = useState<Draft | null>(openNew ? toDraft(undefined, openNew) : null);

  return (
    <section id="cuentas" className="scroll-mt-32">
      <SectionHeading
        title="Cuentas"
        description="Todo en dólares. Real y demo van a la bitácora; backtesting tiene su propia sección, sin dinero real."
        action={
          !editing && (
            <Button variant="outline" onClick={() => setEditing(toDraft())}>
              <PlusIcon />
              Nueva cuenta
            </Button>
          )
        }
      />

      <div className="grid gap-3 md:grid-cols-2">
        {accounts.length === 0 && !editing && (
          <p className="rounded-xl border border-dashed px-5 py-6 text-sm text-muted-foreground md:col-span-2">
            Crea tu primera cuenta para empezar a registrar.
          </p>
        )}
        {accounts.map((a) =>
          editing?.id === a.id ? (
            <AccountForm key={a.id} draft={editing} onDone={() => setEditing(null)} />
          ) : (
            <article key={a.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <WalletIcon className="size-5 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.label}</p>
                  <p className="num mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                    <span className={cn("rounded px-1.5 py-0.5 font-sans text-xs font-medium", KIND_BADGE[a.kind])}>
                      {ACCOUNT_KIND_LABEL[a.kind]}
                    </span>
                    Balance <Private className="font-semibold text-foreground">{money(a.balance, "USD")}</Private>
                  </p>
                  <p className="num mt-0.5 text-xs text-subtle">
                    <Private>{balanceBreakdown(a)}</Private>
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(toDraft(a))}>
                Editar
              </Button>
            </article>
          ),
        )}
        {editing && !editing.id && <AccountForm draft={editing} onDone={() => setEditing(null)} />}
      </div>
    </section>
  );
}

function AccountForm({ draft: initial, onDone }: { draft: Draft; onDone: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function submit() {
    const parsed = accountSchema.safeParse({
      id: draft.id,
      label: draft.label,
      kind: draft.kind,
      currency: "USD",
      start_balance: Number(draft.start_balance.replace(",", ".")),
    });
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
    const id = draft.id;
    start(async () => {
      const res = await deleteAccount(id);
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
      className="space-y-4 rounded-xl border border-brand/40 bg-card px-5 py-4 md:col-span-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3 className="font-medium">{draft.id ? "Editar cuenta" : "Nueva cuenta"}</h3>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_10rem]">
        <div>
          <FieldLabel>Nombre</FieldLabel>
          <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="h-10" autoFocus />
          <FieldError message={errors.label} />
        </div>
        <div>
          <FieldLabel>Tipo</FieldLabel>
          <Segmented aria-label="Tipo de cuenta" value={draft.kind} options={KIND_OPTIONS} onChange={(kind) => setDraft({ ...draft, kind })} />
        </div>
        <div>
          <FieldLabel hint="USD">Balance inicial</FieldLabel>
          <InputGroup
            prefix="$"
            value={draft.start_balance}
            onChange={(e) => setDraft({ ...draft, start_balance: e.target.value })}
            inputMode="decimal"
            aria-invalid={Boolean(errors.start_balance)}
          />
          <FieldError message={errors.start_balance} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-4">
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
