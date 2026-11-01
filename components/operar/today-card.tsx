"use client";

import { CalendarOffIcon, LockIcon, SunriseIcon } from "lucide-react";
import { Panel } from "@/components/app/layout";
import { Button } from "@/components/ui/button";
import { GoalMeter, useGoalProgress } from "@/components/journal/goal-meter";
import { useJournal } from "@/components/journal/journal-context";
import { PauseBanner, usePause } from "@/components/journal/pause";
import { RegisterButton } from "@/components/journal/top-bar";
import { SessionTimerPanel, useSessionClock } from "@/components/journal/session-timer";
import { MOOD_LABEL } from "@/lib/domain/types";
import { dayLabel, signedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { weekdayMondayFirst } from "@/lib/time-core";
import { Private } from "@/components/app/private";

/**
 * Lo único que importa hoy, en una tarjeta: si no hiciste check-in, el check-in; si la sesión está
 * abierta, el reloj, la meta y el botón de registrar; si se cerró, cómo terminó.
 */
export function TodayCard() {
  const { data, liveTrades, openCheckin, openCloseSession } = useJournal();
  const { session, today, account } = data;
  const clock = useSessionClock(session, data.rules);
  const goal = useGoalProgress();
  const pause = usePause();
  const weekend = weekdayMondayFirst(today) >= 5;
  const net = liveTrades.reduce((acc, t) => acc + t.pnl, 0);
  const wins = liveTrades.filter((t) => t.pnl > 0).length;
  const losses = liveTrades.filter((t) => t.pnl < 0).length;

  if (!session) {
    return (
      <Panel aria-label="Hoy" className="border-brand/30 bg-brand/5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
              {weekend ? <CalendarOffIcon className="size-5" /> : <SunriseIcon className="size-5" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground first-letter:uppercase">{dayLabel(today)}</p>
              <p className="text-lg font-semibold">
                {weekend ? "Fin de semana: tu plan en real descansa" : "Haz el check-in para empezar"}
              </p>
              <p className="text-sm text-muted-foreground">
                {weekend
                  ? "El calendario en vivo va de lunes a viernes. Para practicar, usa Backtesting."
                  : "Cómo llegas, cuánto tiempo vas a operar y tu meta del día. Toma 20 segundos."}
              </p>
            </div>
          </div>
          <Button size="lg" variant={weekend ? "outline" : "default"} onClick={openCheckin} className="shrink-0">
            Hacer check-in
          </Button>
        </div>
      </Panel>
    );
  }

  const status =
    session.status === "open" ? "Sesión abierta" : session.status === "blocked" ? "Sesión bloqueada" : "Sesión cerrada · vuelve mañana";

  return (
    <Panel
      aria-label="Hoy"
      title={
        <span className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", session.status === "open" ? "bg-gain" : session.status === "blocked" ? "bg-loss" : "bg-subtle")} />
          {status}
        </span>
      }
      description={`${account.label}${session.mood_before ? ` · llegaste ${MOOD_LABEL[session.mood_before].toLowerCase()}` : ""}`}
      actions={
        session.status === "open" ? (
          <Button variant="ghost" size="sm" onClick={openCloseSession}>
            Cerrar sesión
          </Button>
        ) : (
          session.status === "blocked" &&
          !session.journal && (
            <Button variant="ghost" size="sm" onClick={openCloseSession}>
              Escribir reflexión
            </Button>
          )
        )
      }
      bodyClassName="space-y-4"
    >
      <div className={cn("grid gap-3", clock && goal ? "sm:grid-cols-3" : clock || goal ? "sm:grid-cols-2" : undefined)}>
        <div className="rounded-lg bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">Resultado de hoy</p>
          <p className={cn("num mt-1 text-3xl font-semibold tracking-tight", net > 0 ? "text-gain" : net < 0 ? "text-loss" : "")}>
            <Private>{signedMoney(net, account.currency)}</Private>
          </p>
          <p className="num mt-1 text-xs text-subtle">
            {liveTrades.length} {liveTrades.length === 1 ? "operación" : "operaciones"} · {wins} ganadas · {losses} perdidas
          </p>
        </div>
        {clock && <SessionTimerPanel clock={clock} />}
        {goal && <GoalMeter progress={goal} currency={account.currency} open={session.status === "open"} />}
      </div>

      <PauseBanner pause={pause} />

      {session.status === "blocked" && (
        <div role="status" className="flex gap-3 rounded-lg border border-loss/25 bg-loss/10 px-4 py-3 text-sm">
          <LockIcon className="mt-0.5 size-4 shrink-0 text-loss" />
          <p>{session.blocked_reason ?? "Rompiste una regla que bloquea la sesión. Se acabó el día."}</p>
        </div>
      )}

      {session.status === "open" && (
        <RegisterButton className="hidden h-12 px-8 text-base sm:inline-flex" />
      )}
    </Panel>
  );
}
