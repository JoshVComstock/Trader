"use client";

import { LockIcon } from "lucide-react";
import { Panel } from "@/components/app/layout";
import { Button } from "@/components/ui/button";
import { defaultPnl } from "@/lib/calc/trade";
import { MOOD_LABEL } from "@/lib/domain/types";
import { dayLabel } from "@/lib/format";
import { computeMeters, type EngineTrade, type Meter } from "@/lib/rules";
import { cn } from "@/lib/utils";
import { useJournal } from "./journal-context";
import { CalmSelfMessage, PauseBanner, usePause } from "./pause";
import { plannedMinutes, SessionTimerPanel, useSessionClock } from "./session-timer";

function MeterBar({ meter }: { meter: Meter }) {
  const pct = meter.limit ? Math.min(100, (meter.value / meter.limit) * 100) : 0;
  const color = { ok: "bg-foreground/50", near: "bg-warn", hit: "bg-loss" }[meter.level];
  const text = { ok: "text-foreground", near: "text-warn", hit: "text-loss" }[meter.level];
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm text-muted-foreground">{meter.label}</span>
        <span className={cn("num text-base font-semibold", text)}>
          {meter.value}
          {meter.limit !== null && <span className="font-normal text-subtle">/{meter.limit}</span>}
          {meter.unit && <span className="ml-0.5 text-xs font-normal text-subtle">{meter.unit}</span>}
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={meter.label}
        aria-valuenow={meter.value}
        aria-valuemin={0}
        aria-valuemax={meter.limit ?? undefined}
      >
        <div className={cn("h-full rounded-full transition-[width]", color)} style={{ width: `${meter.limit ? pct : 0}%` }} />
      </div>
    </div>
  );
}

/** Bloque 3: medidores en vivo de la sesión. Va arriba porque es lo que hay que mirar mientras se opera. */
export function DisciplineStrip() {
  const { data, pending, openCheckin, openCloseSession } = useJournal();
  const pause = usePause();
  const { session, mode } = data;
  const sessionClock = useSessionClock(mode === "live" ? session : null, data.rules);

  if (mode === "live" && !session) {
    return (
      <Panel aria-label="Disciplina" className="border-dashed bg-transparent">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Todavía no abriste la sesión de hoy</p>
            <p className="text-sm text-muted-foreground">
              Un check-in rápido antes de la primera operación: cómo llegas, cuánto tiempo vas a operar y tus reglas.
            </p>
          </div>
          <Button variant="outline" size="lg" onClick={openCheckin}>
            Hacer check-in
          </Button>
        </div>
      </Panel>
    );
  }

  if (!session) {
    return (
      <Panel aria-label="Disciplina" className="border-dashed bg-transparent">
        <p className="text-sm text-muted-foreground">
          Registra tu primera operación de backtesting: cada día de datos se vuelve una sesión con las mismas reglas que en real.
        </p>
      </Panel>
    );
  }

  // En vivo, lo que se acaba de registrar cuenta ya, antes de que confirme el servidor.
  const optimistic: EngineTrade[] =
    mode !== "live"
      ? []
      : pending
          .filter((p) => p.status !== "error" && !data.sessionTrades.some((t) => t.id === p.payload.id))
          .map(({ payload: p, createdAt }) => ({
            opened_at: p.opened_at ?? new Date(createdAt).toISOString(),
            closed_at: p.closed_at,
            stake: p.stake,
            pnl: p.pnl ?? defaultPnl(p.result, p.stake, p.tp),
            impulse: p.checklist.impulse,
          }));
  const trades: EngineTrade[] = [
    ...data.sessionTrades.map((t) => ({
      opened_at: t.opened_at,
      closed_at: t.closed_at,
      stake: t.stake,
      pnl: t.pnl,
      impulse: t.checklist.impulse,
    })),
    ...optimistic,
  ];
  const lastAt = trades.reduce((max, t) => (t.opened_at > max ? t.opened_at : max), session.opened_at);
  const reference =
    mode === "backtest"
      ? lastAt
      : new Date(Date.parse(session.opened_at) + (sessionClock?.elapsedSec ?? 0) * 1000).toISOString();
  const meters = computeMeters({
    sessionTrades: trades,
    sessionOpenedAt: session.opened_at,
    now: reference,
    rules: data.rules,
    plannedMinutes: mode === "live" ? plannedMinutes(session, data.rules) : null,
  });
  // Con el temporizador a la vista, el medidor de tiempo sobra en vivo.
  const visibleMeters = mode === "live" ? meters.filter((m) => m.key !== "minutes") : meters;

  const title = mode === "live" ? "Sesión de hoy" : `Última sesión de backtesting · ${dayLabel(session.date)}`;
  const description = session.mood_before ? `Llegaste ${MOOD_LABEL[session.mood_before].toLowerCase()}` : undefined;

  const actions = (
    <>
      {mode === "live" && session.status === "open" && (
        <Button variant="outline" size="sm" onClick={openCloseSession}>
          Cerrar sesión
        </Button>
      )}
      {mode === "live" && session.status === "closed" && (
        <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">Cerrada · vuelve mañana</span>
      )}
      {session.status === "blocked" && !session.journal && mode === "live" && (
        <Button variant="ghost" size="sm" onClick={openCloseSession}>
          Escribir reflexión
        </Button>
      )}
    </>
  );

  return (
    <Panel aria-label="Disciplina" title={title} description={description} actions={actions} bodyClassName="space-y-4">
      <div className={cn("grid gap-5", sessionClock && "lg:grid-cols-[minmax(16rem,22rem)_1fr] lg:items-center")}>
        {sessionClock && <SessionTimerPanel clock={sessionClock} />}
        <div className={cn("grid grid-cols-2 gap-x-6 gap-y-4", visibleMeters.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3")}>
          {visibleMeters.map((m) => (
            <MeterBar key={m.key} meter={m} />
          ))}
        </div>
      </div>

      <PauseBanner pause={pause} />

      {session.status === "blocked" && (
        <div role="status" className="flex gap-3 rounded-lg border border-loss/25 bg-loss/10 px-4 py-3 text-sm">
          <LockIcon className="mt-0.5 size-4 shrink-0 text-loss" />
          <p>
            {session.blocked_reason ??
              "Rompiste una regla que bloquea la sesión. Se acabó el día — lo decidiste tú cuando estabas tranquilo."}
          </p>
        </div>
      )}

      {/* Cuando más cuesta respetar el plan: bloqueado, en pausa o al borde de un límite. */}
      {(session.status === "blocked" || pause.active || meters.some((m) => m.level !== "ok")) && <CalmSelfMessage />}
    </Panel>
  );
}
