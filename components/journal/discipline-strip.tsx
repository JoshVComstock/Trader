"use client";

import { cn } from "@/lib/utils";
import { LockIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { reopenSession } from "@/app/actions/sessions";
import { Button } from "@/components/ui/button";
import { defaultPnl } from "@/lib/calc/trade";
import { MOOD_LABEL } from "@/lib/domain/types";
import { dayLabel } from "@/lib/format";
import { computeMeters, type Meter } from "@/lib/rules";
import { useJournal } from "./journal-context";

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

function MeterBar({ meter }: { meter: Meter }) {
  const pct = meter.limit ? Math.min(100, (meter.value / meter.limit) * 100) : 0;
  const color = { ok: "bg-foreground/50", near: "bg-warn", hit: "bg-loss" }[meter.level];
  const text = { ok: "text-foreground", near: "text-warn", hit: "text-loss" }[meter.level];
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{meter.label}</span>
        <span className={cn("num text-sm font-medium", text)}>
          {meter.value}
          {meter.limit !== null && <span className="text-subtle">/{meter.limit}</span>}
          {meter.unit && <span className="ml-0.5 text-xs text-subtle">{meter.unit}</span>}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
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

/** Medidores en vivo de la sesión. Va arriba porque es lo que hay que mirar mientras se opera. */
export function DisciplineStrip() {
  const { data, pending, openCheckin, openCloseSession } = useJournal();
  const { session, mode } = data;
  const live = mode === "live" && session?.status === "open";
  const now = useNow(live);
  const [reopening, startReopen] = useTransition();

  if (mode === "live" && !session) {
    return (
      <section aria-label="Disciplina" className="flex flex-col gap-3 rounded-xl border border-dashed px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Todavía no abriste la sesión de hoy</p>
          <p className="text-sm text-muted-foreground">Un check-in rápido antes de la primera operación: cómo llegas y tus reglas.</p>
        </div>
        <Button variant="outline" onClick={openCheckin}>
          Hacer check-in
        </Button>
      </section>
    );
  }

  if (!session) {
    return (
      <section aria-label="Disciplina" className="rounded-xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
        Registra tu primera operación de backtesting: cada día de datos se vuelve una sesión con las mismas reglas que en real.
      </section>
    );
  }

  // En vivo, lo que se acaba de registrar cuenta ya, antes de que confirme el servidor.
  const optimistic =
    mode !== "live"
      ? []
      : pending
          .filter((p) => p.status !== "error" && !data.sessionTrades.some((t) => t.id === p.payload.id))
          .map(({ payload: p }) => ({
            opened_at: p.opened_at ?? new Date(now).toISOString(),
            closed_at: p.closed_at,
            stake: p.stake,
            pnl: p.pnl ?? defaultPnl(p.result, p.stake, p.tp),
            impulse: p.checklist.impulse,
          }));
  const trades = [
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
    mode === "backtest" ? lastAt : session.status === "open" ? new Date(now).toISOString() : (session.closed_at ?? lastAt);
  const meters = computeMeters({ sessionTrades: trades, sessionOpenedAt: session.opened_at, now: reference, rules: data.rules });

  return (
    <section aria-label="Disciplina" className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <p className="text-xs text-muted-foreground">
          {mode === "live" ? "Sesión de hoy" : `Última sesión de backtesting · ${dayLabel(session.date)}`}
          {session.mood_before && <span className="text-subtle"> · llegaste {MOOD_LABEL[session.mood_before].toLowerCase()}</span>}
        </p>
        {mode === "live" && session.status === "open" && (
          <Button variant="ghost" size="sm" onClick={openCloseSession}>
            Cerrar sesión
          </Button>
        )}
        {mode === "live" && session.status === "closed" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-subtle">Cerrada</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={reopening}
              onClick={() =>
                startReopen(async () => {
                  const res = await reopenSession(session.id);
                  if (!res.ok) toast.error(res.error);
                })
              }
            >
              Reabrir
            </Button>
          </div>
        )}
        {session.status === "blocked" && !session.journal && mode === "live" && (
          <Button variant="ghost" size="sm" onClick={openCloseSession}>
            Escribir reflexión
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 pt-3 pb-4 md:grid-cols-4">
        {meters.map((m) => (
          <MeterBar key={m.key} meter={m} />
        ))}
      </div>

      {session.status === "blocked" && (
        <div role="status" className="flex gap-3 border-t border-loss/20 bg-loss/10 px-4 py-3 text-sm">
          <LockIcon className="mt-0.5 size-4 shrink-0 text-loss" />
          <p>
            {session.blocked_reason ?? "Rompiste una regla que bloquea la sesión. Se acabó el día — lo decidiste tú cuando estabas tranquilo."}
          </p>
        </div>
      )}
    </section>
  );
}
