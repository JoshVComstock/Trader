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

/**
 * Cómo queda tu cuenta con esta operación, paso a paso y en dólares:
 * cuenta → entras con → arriesgas → cierras con → ganas/pierdes → cuenta queda.
 */
export function AccountFlow({
  balance,
  entry,
  multiplier,
  stake,
  pnl,
  currency,
}: {
  balance: number;
  entry: number | null;
  multiplier: number | null;
  stake: number;
  pnl: number | null;
  currency: string;
}) {
  const hasPnl = pnl !== null && Number.isFinite(pnl);
  const r = hasPnl && stake > 0 ? pnl / stake : null;
  const steps: { label: string; value: string; tone?: string }[] = [];
  if (balance > 0) steps.push({ label: "Tu cuenta", value: money(balance, currency) });
  if (entry !== null) {
    steps.push({ label: "Entras con", value: `${money(entry, currency)}${multiplier && Number.isFinite(multiplier) ? ` ×${multiplier}` : ""}` });
  }
  if (stake > 0) steps.push({ label: "Arriesgas", value: money(stake, currency) });
  if (hasPnl && entry !== null) steps.push({ label: "Cierra en", value: money(entry + pnl, currency) });
  if (hasPnl) {
    steps.push({
      label: pnl >= 0 ? "Ganas" : "Pierdes",
      value: `${pnl > 0 ? "+" : pnl < 0 ? "−" : ""}${money(Math.abs(pnl), currency)}`,
      tone: pnl > 0 ? "text-gain" : pnl < 0 ? "text-loss" : undefined,
    });
    if (balance > 0) steps.push({ label: "Tu cuenta queda", value: money(balance + pnl, currency), tone: "text-foreground" });
  }
  if (steps.length < 2) return null;

  return (
    <div className="mt-4 rounded-lg border bg-muted/20 p-3">
      <ol className="flex flex-wrap items-stretch gap-1.5">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-subtle">→</span>}
            <span className="rounded-md bg-background/60 px-2 py-1">
              <span className="block text-[10px] text-subtle">{s.label}</span>
              <span className={cn("num block text-sm font-semibold", s.tone)}>{s.value}</span>
            </span>
          </li>
        ))}
      </ol>
      {r !== null && hasPnl && (
        <p className="mt-2 text-sm text-muted-foreground">
          {pnl > 0
            ? `Ganaste ${(r).toFixed(1)} veces lo que arriesgabas: `
            : pnl < 0
              ? Math.abs(r) > 1.001
                ? "Perdiste más que tu stop: revisa si lo moviste. "
                : "Perdiste lo que arriesgabas: "
              : "Empate: "}
          <span className={cn("num font-semibold", pnl > 0 ? "text-gain" : pnl < 0 ? "text-loss" : "")}>
            {`${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}R`}
          </span>
        </p>
      )}
    </div>
  );
}
