"use client";

import { TimerIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { Session } from "@/lib/data";
import type { Rule } from "@/lib/rules";
import { timeShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface SessionClock {
  /** Hora de apertura (check-in). */
  openedAt: string;
  elapsedSec: number;
  /** Lo que dijiste en el check-in; si no, la regla de duración máxima. */
  plannedMin: number | null;
  remainingSec: number | null;
  over: boolean;
  running: boolean;
}

/** Minutos planeados para la sesión: los del check-in mandan sobre la regla. */
export function plannedMinutes(session: Pick<Session, "planned_minutes">, rules: readonly Rule[]): number | null {
  if (session.planned_minutes) return session.planned_minutes;
  const rule = rules.find((r) => r.type === "max_session_minutes" && r.enabled);
  return rule?.type === "max_session_minutes" ? rule.params.minutes : null;
}

/** Reloj de la sesión en vivo. Avanza cada segundo mientras está abierta. */
export function useSessionClock(session: Session | null, rules: readonly Rule[]): SessionClock | null {
  const running = session?.status === "open";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!session) return null;
  const end = running ? now : Date.parse(session.closed_at ?? new Date(now).toISOString());
  const elapsedSec = Math.max(0, Math.floor((end - Date.parse(session.opened_at)) / 1000));
  const plannedMin = plannedMinutes(session, rules);
  const remainingSec = plannedMin === null ? null : plannedMin * 60 - elapsedSec;
  return {
    openedAt: session.opened_at,
    elapsedSec,
    plannedMin,
    remainingSec,
    over: remainingSec !== null && remainingSec < 0,
    running,
  };
}

/** 754 → "12:34"; 3725 → "1:02:05". */
export function clock(totalSec: number): string {
  const s = Math.abs(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function tone(c: SessionClock) {
  if (c.over) return "text-loss";
  if (c.remainingSec !== null && c.plannedMin && c.remainingSec <= c.plannedMin * 60 * 0.25) return "text-warn";
  return "text-foreground";
}

/** Chip compacto para la barra del journal y para el formulario. */
export function SessionTimerChip({ clock: c, className }: { clock: SessionClock; className?: string }) {
  const label =
    c.remainingSec === null
      ? `En sesión ${clock(c.elapsedSec)}`
      : c.over
        ? `Te pasaste ${clock(c.remainingSec)}`
        : `Quedan ${clock(c.remainingSec)}`;
  return (
    <span
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm", tone(c), className)}
      title={`Abriste la sesión a las ${timeShort(c.openedAt)}${c.plannedMin ? ` · plan de ${c.plannedMin} min` : ""}`}
      role="timer"
      aria-live="off"
    >
      <TimerIcon className="size-4 opacity-70" />
      <span className="num">{label}</span>
    </span>
  );
}

/** Versión grande para la tira de disciplina. */
export function SessionTimerPanel({ clock: c }: { clock: SessionClock }) {
  const pct = c.plannedMin ? Math.min(100, (c.elapsedSec / (c.plannedMin * 60)) * 100) : 0;
  const bar = c.over ? "bg-loss" : tone(c) === "text-warn" ? "bg-warn" : "bg-brand";
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {c.remainingSec === null ? "Tiempo en sesión" : c.over ? "Te pasaste de tu tiempo" : "Tiempo restante"}
        </span>
        <span className="num text-xs text-subtle">
          Apertura {timeShort(c.openedAt)}
          {c.plannedMin ? ` · plan ${c.plannedMin} min` : ""}
        </span>
      </div>
      <p className={cn("num mt-1 text-3xl font-semibold tracking-tight", tone(c))}>
        {c.remainingSec === null ? clock(c.elapsedSec) : clock(c.remainingSec)}
      </p>
      {c.plannedMin && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className={cn("h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
        </div>
      )}
      {!c.running && <p className="mt-1.5 text-xs text-subtle">La sesión ya no está abierta: el reloj se detuvo.</p>}
    </div>
  );
}
