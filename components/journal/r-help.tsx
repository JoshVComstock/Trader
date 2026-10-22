"use client";

import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Explicación de R en una línea, para quien no la conoce:
 * R es tu stop. +3R = ganaste tres veces lo que arriesgaste; −1R = perdiste tu stop completo.
 */
export const R_EXPLANATION =
  "R es lo que arriesgas en cada operación: tu stop. Si tu stop es $1 y el spike te paga $3, ganaste 3R. Si pierdes el stop completo, es −1R. Así comparas operaciones aunque cambies el monto.";

export function RHelp({ className, label = "¿Qué es R?" }: { className?: string; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn("inline-flex items-center gap-1 text-xs text-subtle underline-offset-2 hover:text-foreground hover:underline", className)}
        >
          <InfoIcon className="size-3.5" />
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-sm leading-snug">{R_EXPLANATION}</TooltipContent>
    </Tooltip>
  );
}

/** Traduce el resultado a palabras: cuánto ganaste o perdiste y cuántas veces tu stop. */
export function ResultExplainer({
  result,
  pnl,
  stake,
  currency,
}: {
  result: string;
  pnl: number | null;
  stake: number;
  currency: string;
}) {
  if (!result || pnl === null || !Number.isFinite(pnl) || !(stake > 0)) return null;
  const r = pnl / stake;
  const rText = `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}R`;
  const tone = pnl > 0 ? "border-gain/30 bg-gain/10" : pnl < 0 ? "border-loss/30 bg-loss/10" : "bg-muted/40";
  const sentence =
    pnl > 0
      ? `Ganaste ${money(pnl, currency)}: ${Math.abs(r).toFixed(1)} veces lo que arriesgabas (${money(stake, currency)}).`
      : pnl < 0
        ? Math.abs(r) > 1.001
          ? `Perdiste ${money(-pnl, currency)}: más que tu stop de ${money(stake, currency)}. Revisa si lo moviste.`
          : `Perdiste ${money(-pnl, currency)}${Math.abs(r) > 0.999 ? ", tu stop completo" : `, ${(Math.abs(r) * 100).toFixed(0)}% de tu stop`}.`
        : "Empate: ni ganaste ni perdiste.";
  return (
    <div className={cn("mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5", tone)}>
      <p className="text-sm">{sentence}</p>
      <span className={cn("num shrink-0 text-lg font-semibold", pnl > 0 ? "text-gain" : pnl < 0 ? "text-loss" : "")}>{rText}</span>
    </div>
  );
}
