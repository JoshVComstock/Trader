"use client";

import { ShieldCheckIcon, TargetIcon } from "lucide-react";
import { money, signedMoney } from "@/lib/format";
import { goalProgress, type GoalProgress } from "@/lib/rules";
import { cn } from "@/lib/utils";
import { useJournal } from "./journal-context";
import { Private } from "@/components/app/private";

/** Avance hacia el objetivo de hoy (con lo que ya registraste, también lo pendiente). */
export function useGoalProgress(): GoalProgress | null {
  const { data, liveTrades } = useJournal();
  if (data.mode !== "live" || !data.session) return null;
  return goalProgress({ sessionTrades: liveTrades, goalAmount: data.session.goal_amount, rules: data.rules });
}

/** Medidor grande para la tira de disciplina. */
export function GoalMeter({ progress, currency, open }: { progress: GoalProgress; currency: string; open: boolean }) {
  const pct = Math.max(0, Math.min(100, progress.ratio * 100));
  const near = !progress.reached && progress.ratio >= 0.66;
  const bar = progress.gaveBack ? "bg-loss" : progress.reached ? "bg-gain" : near ? "bg-gain/70" : "bg-foreground/50";
  return (
    <div className={cn("rounded-lg px-4 py-3", progress.reached ? "border border-gain/30 bg-gain/10" : "bg-muted/40")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TargetIcon className="size-3.5" />
          Objetivo del día
        </span>
        <span className="num text-xs text-subtle">meta <Private>{money(progress.goal, currency)}</Private></span>
      </div>
      <p className={cn("num mt-1 text-2xl font-semibold tracking-tight", progress.net > 0 ? "text-gain" : progress.net < 0 ? "text-loss" : "")}>
        <Private>{signedMoney(progress.net, currency)}</Private>
        <span className="ml-1 text-sm font-normal text-subtle">de <Private>{money(progress.goal, currency)}</Private></span>
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Objetivo del día" aria-valuenow={progress.net} aria-valuemin={0} aria-valuemax={progress.goal}>
        <div className={cn("h-full rounded-full transition-[width]", bar)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {progress.gaveBack
          ? "Devolviste lo que te permitías después de la meta."
          : progress.reached
            ? open
              ? "Llegaste a tu objetivo. Lo que sigue es arriesgar lo ganado."
              : "Llegaste a tu objetivo y paraste a tiempo."
            : progress.net < 0
              ? `Te faltan ${money(progress.goal - progress.net, currency)}. No persigas la pérdida.`
              : `Te faltan ${money(progress.goal - progress.net, currency)}.`}
      </p>
      {open && progress.protectFloor !== null && !progress.gaveBack && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-gain">
          <ShieldCheckIcon className="size-3.5" />
          Ganancia protegida: si bajas de <Private>{signedMoney(progress.protectFloor, currency)}</Private>, se para.
        </p>
      )}
    </div>
  );
}

/** Línea compacta para la ventana flotante. */
export function GoalLine({ progress, currency }: { progress: GoalProgress; currency: string }) {
  const pct = Math.max(0, Math.min(100, progress.ratio * 100));
  return (
    <div className={cn("border-b px-3 py-2", progress.reached && "bg-gain/10")}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <TargetIcon className="size-3" />
          Objetivo
        </span>
        <span className="num font-semibold">
          <span className={progress.net > 0 ? "text-gain" : progress.net < 0 ? "text-loss" : ""}><Private>{signedMoney(progress.net, currency)}</Private></span>
          <span className="font-normal text-subtle"> / <Private>{money(progress.goal, currency)}</Private></span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", progress.reached ? "bg-gain" : "bg-foreground/50")} style={{ width: `${pct}%` }} />
      </div>
      {progress.reached && <p className="mt-1 text-[11px] text-gain">Llegaste. Protege lo ganado.</p>}
    </div>
  );
}
