"use client";

import { ArrowDownToLineIcon, ArrowUpFromLineIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addCashflow, deleteCashflow } from "@/app/actions/settings";
import { FieldError, FieldLabel } from "@/components/app/choice";
import { InputGroup, Segmented } from "@/components/app/input-group";
import { Panel } from "@/components/app/layout";
import { PrivacyToggle } from "@/components/app/privacy-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { zodFieldErrors } from "@/lib/action-result";
import { dayLabel, money, signedMoney } from "@/lib/format";
import { cashflowSchema } from "@/lib/schemas";
import type { Account, Cashflow, CashflowKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Private } from "@/components/app/private";

const KIND_OPTIONS: { value: CashflowKind; label: string }[] = [
  { value: "withdrawal", label: "Retiro" },
  { value: "deposit", label: "Depósito" },
];

/**
 * Balance real de la cuenta: lo inicial, lo que ganaste o perdiste operando y lo que sacaste o
 * pusiste. Los retiros bajan el balance (y con él el % de riesgo de cada operación).
 */
export function BalanceCard({ account, cashflows, today }: { account: Account; cashflows: Cashflow[]; today: string }) {
  const [open, setOpen] = useState<CashflowKind | null>(null);
  const [removing, startRemove] = useTransition();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? cashflows : cashflows.slice(0, 4);

  function remove(c: Cashflow) {
    startRemove(async () => {
      const res = await deleteCashflow(c.id);
      if (!res.ok) toast.error(res.error);
      else toast.success(c.kind === "withdrawal" ? "Retiro borrado" : "Depósito borrado");
    });
  }

  return (
    <Panel id="balance" title="Balance de la cuenta" description={account.label} actions={<PrivacyToggle />} bodyClassName="space-y-4">
      <div>
        <p className="num text-4xl font-semibold tracking-tight"><Private>{money(account.balance, account.currency)}</Private></p>
        <dl className="num mt-3 space-y-1.5 text-sm">
          <Line label="Inicial" value={money(account.start_balance, account.currency)} />
          <Line
            label="Operaciones"
            value={signedMoney(account.pnl_total, account.currency)}
            className={account.pnl_total > 0 ? "text-gain" : account.pnl_total < 0 ? "text-loss" : undefined}
          />
          {account.deposits_total > 0 && <Line label="Depósitos" value={`+${money(account.deposits_total, account.currency)}`} />}
          {account.withdrawals_total > 0 && (
            <Line label="Retiros" value={`−${money(account.withdrawals_total, account.currency)}`} className="text-warn" />
          )}
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => setOpen("withdrawal")}>
          <ArrowUpFromLineIcon />
          Retiro
        </Button>
        <Button variant="ghost" onClick={() => setOpen("deposit")}>
          <ArrowDownToLineIcon />
          Depósito
        </Button>
      </div>

      {cashflows.length > 0 && (
        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">Movimientos</p>
          <ul className="space-y-1">
            {visible.map((c) => (
              <li key={c.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">
                    {c.kind === "withdrawal" ? "Retiro" : "Depósito"}
                    <span className="text-subtle"> · {dayLabel(c.date)}</span>
                  </span>
                  {c.note && <span className="block truncate text-xs text-muted-foreground">{c.note}</span>}
                </span>
                <span className={cn("num text-sm font-medium", c.kind === "withdrawal" ? "text-warn" : "text-gain")}>
                  <Private>
                    {c.kind === "withdrawal" ? "−" : "+"}
                    {money(c.amount, account.currency)}
                  </Private>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="opacity-60 group-hover:opacity-100"
                  disabled={removing}
                  onClick={() => remove(c)}
                  aria-label="Borrar movimiento"
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
          {cashflows.length > 4 && (
            <Button variant="link" size="sm" className="px-2" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Ver menos" : `Ver los ${cashflows.length}`}
            </Button>
          )}
        </div>
      )}

      <CashflowDialog account={account} kind={open} today={today} onClose={() => setOpen(null)} />
    </Panel>
  );
}

function Line({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-sans text-muted-foreground">{label}</dt>
      <dd className={className}>
        <Private>{value}</Private>
      </dd>
    </div>
  );
}

function CashflowDialog({
  account,
  kind: initialKind,
  today,
  onClose,
}: {
  account: Account;
  kind: CashflowKind | null;
  today: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={initialKind !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {initialKind && <CashflowForm key={initialKind} account={account} initialKind={initialKind} today={today} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function CashflowForm({
  account,
  initialKind,
  today,
  onDone,
}: {
  account: Account;
  initialKind: CashflowKind;
  today: string;
  onDone: () => void;
}) {
  const [kind, setKind] = useState(initialKind);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const value = Number(amount.replace(",", "."));
  const after = Number.isFinite(value) && value > 0 ? account.balance + (kind === "withdrawal" ? -value : value) : null;

  function submit() {
    const parsed = cashflowSchema.safeParse({ account_id: account.id, kind, amount: value, date, note: note.trim() || null });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error.issues));
      return;
    }
    if (kind === "withdrawal" && value > account.balance) {
      setErrors({ amount: `Tienes ${money(account.balance, account.currency)} en la cuenta` });
      return;
    }
    start(async () => {
      const res = await addCashflow(parsed.data);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(`${kind === "withdrawal" ? "Retiro" : "Depósito"} guardado. Balance: ${money(res.data.balance, account.currency)}`);
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
      <DialogHeader>
        <DialogTitle>{kind === "withdrawal" ? "Registrar un retiro" : "Registrar un depósito"}</DialogTitle>
        <DialogDescription>
          {kind === "withdrawal"
            ? "Lo que sacaste de la cuenta. Baja el balance, no cuenta como pérdida."
            : "Lo que pusiste en la cuenta. Sube el balance, no cuenta como ganancia."}
        </DialogDescription>
      </DialogHeader>

      <Segmented aria-label="Tipo de movimiento" value={kind} options={KIND_OPTIONS} onChange={setKind} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel hint="USD">Monto</FieldLabel>
          <InputGroup
            prefix="$"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            autoFocus
            aria-invalid={Boolean(errors.amount)}
          />
          <FieldError message={errors.amount} />
        </div>
        <div>
          <FieldLabel>Fecha</FieldLabel>
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="h-10" />
          <FieldError message={errors.date} />
        </div>
      </div>
      <div>
        <FieldLabel hint="opcional">Nota</FieldLabel>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: retiro a Binance" className="h-10" maxLength={200} />
      </div>

      {after !== null && (
        <p className="num rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <span className="font-sans text-muted-foreground">La cuenta queda en </span>
          <span className={cn("font-semibold", after < 0 && "text-loss")}>{money(after, account.currency)}</span>
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
