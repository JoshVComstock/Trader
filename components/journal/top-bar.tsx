"use client";

import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppMenu } from "@/components/app/app-menu";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCOUNT_KIND_LABEL, type JournalMode } from "@/lib/domain/types";
import type { Account } from "@/lib/data";
import { monthLabel } from "@/lib/format";
import { shiftMonth } from "@/lib/time-core";
import { useJournal } from "./journal-context";

export function TopBar({
  mode,
  accounts,
  accountId,
  month,
  today,
}: {
  mode: JournalMode;
  accounts: Account[];
  accountId: string | null;
  month: string;
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  const isCurrentMonth = month === today.slice(0, 7);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:flex-nowrap">
        <Link href={mode === "backtest" ? "/backtesting" : "/journal"} className="flex shrink-0 items-center gap-2" aria-label="Inicio">
          <Logo className="size-6" />
          {mode === "backtest" && (
            <span className="rounded-md bg-brand/15 px-1.5 py-0.5 text-[11px] font-medium text-brand">Backtesting</span>
          )}
        </Link>

        {accounts.length > 0 && accountId && (
          <Select value={accountId} onValueChange={(v) => go({ cuenta: v })}>
            <SelectTrigger size="sm" className="h-8 max-w-52 min-w-0" aria-label="Cuenta">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                  {a.kind === "demo" && ` · ${ACCOUNT_KIND_LABEL.demo}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center" role="group" aria-label="Mes">
          <Button variant="ghost" size="icon-sm" onClick={() => go({ mes: shiftMonth(month, -1) })} aria-label="Mes anterior">
            <ChevronLeftIcon />
          </Button>
          <button
            type="button"
            className="min-w-28 text-center text-sm font-medium"
            onClick={() => go({ mes: null })}
            title="Volver al mes actual"
          >
            {monthLabel(month)}
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => go({ mes: shiftMonth(month, 1) })}
            disabled={isCurrentMonth && mode === "live"}
            aria-label="Mes siguiente"
          >
            <ChevronRightIcon />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {accountId && <RegisterButton className="hidden sm:inline-flex" />}
          <AppMenu mode={mode} accountId={accountId} />
        </div>
      </div>
    </header>
  );
}

export function RegisterButton({ className }: { className?: string }) {
  const { startTrade } = useJournal();
  return (
    <Button className={className} onClick={startTrade}>
      <PlusIcon />
      Registrar operación
    </Button>
  );
}

/** Botón flotante en móvil: al alcance del pulgar. */
export function RegisterFab() {
  const { startTrade } = useJournal();
  return (
    <Button
      onClick={startTrade}
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 h-14 rounded-full px-5 text-base shadow-lg shadow-black/30 sm:hidden"
    >
      <PlusIcon className="size-5" />
      Registrar
    </Button>
  );
}
