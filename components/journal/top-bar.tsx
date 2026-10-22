"use client";

import { ChevronLeftIcon, ChevronRightIcon, HourglassIcon, PlusIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCOUNT_KIND_LABEL, type JournalMode } from "@/lib/domain/types";
import type { Account } from "@/lib/data";
import { monthLabel } from "@/lib/format";
import { shiftMonth } from "@/lib/time-core";
import { useJournal } from "./journal-context";
import { usePause } from "./pause";
import { clock, SessionTimerChip, useSessionClock } from "./session-timer";

/** Bloque 1 del journal: cabecera de la app + barra de cuenta, mes, temporizador y registrar. */
export function TopBar({
  mode,
  accounts,
  accountId,
  month,
  today,
}: {
  mode: JournalMode;
  accounts: Account[];
  accountId: string;
  month: string;
  today: string;
}) {
  return (
    <AppHeader
      accountId={accountId}
      toolbar={<JournalToolbar mode={mode} accounts={accounts} accountId={accountId} month={month} today={today} />}
    />
  );
}

function JournalToolbar({
  mode,
  accounts,
  accountId,
  month,
  today,
}: {
  mode: JournalMode;
  accounts: Account[];
  accountId: string;
  month: string;
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data } = useJournal();
  const sessionClock = useSessionClock(mode === "live" ? data.session : null, data.rules);

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
    <>
      {mode === "backtest" && (
        <span className="rounded-md bg-brand/15 px-2 py-1 text-xs font-medium text-brand">Backtesting · sin dinero real</span>
      )}

      <Select value={accountId} onValueChange={(v) => go({ cuenta: v })}>
        <SelectTrigger className="h-9 max-w-60 min-w-0" aria-label="Cuenta">
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

      <div className="flex items-center rounded-lg border" role="group" aria-label="Mes">
        <Button variant="ghost" size="icon-sm" onClick={() => go({ mes: shiftMonth(month, -1) })} aria-label="Mes anterior">
          <ChevronLeftIcon />
        </Button>
        <button
          type="button"
          className="min-w-32 px-1 text-center text-sm font-medium"
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

      <div className="ml-auto flex items-center gap-2">
        {sessionClock && sessionClock.running && <SessionTimerChip clock={sessionClock} />}
        <RegisterButton className="hidden sm:inline-flex" />
      </div>
    </>
  );
}

export function RegisterButton({ className }: { className?: string }) {
  const { startTrade } = useJournal();
  const pause = usePause();
  if (pause.active) {
    return (
      <Button className={className} size="lg" variant="outline" onClick={startTrade} aria-disabled>
        <HourglassIcon />
        Pausa <span className="num">{clock(pause.remainingSec)}</span>
      </Button>
    );
  }
  return (
    <Button className={className} size="lg" onClick={startTrade}>
      <PlusIcon />
      Registrar operación
    </Button>
  );
}

/** Botón flotante en móvil: al alcance del pulgar. */
export function RegisterFab() {
  const { startTrade } = useJournal();
  const pause = usePause();
  return (
    <Button
      onClick={startTrade}
      variant={pause.active ? "secondary" : "default"}
      aria-disabled={pause.active || undefined}
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 h-14 rounded-full px-5 text-base shadow-lg shadow-black/30 sm:hidden"
    >
      {pause.active ? <HourglassIcon className="size-5" /> : <PlusIcon className="size-5" />}
      {pause.active ? <span className="num">Pausa {clock(pause.remainingSec)}</span> : "Registrar"}
    </Button>
  );
}
