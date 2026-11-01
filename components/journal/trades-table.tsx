"use client";

import { cn } from "@/lib/utils";
import { Panel } from "@/components/app/layout";
import { ChevronLeftIcon, ChevronRightIcon, LoaderIcon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { defaultPnl, deriveTrade } from "@/lib/calc/trade";
import { instrumentLabel } from "@/lib/domain/instruments";
import { DIRECTION_LABEL, MOOD_LABEL, OUTCOME_LABEL, type Outcome } from "@/lib/domain/types";
import { dateTimeShort, dayLabel, money, rValue } from "@/lib/format";
import { localDate } from "@/lib/time-core";
import { useJournal } from "./journal-context";
import { RHelp } from "./r-help";
import type { PendingTrade } from "./pending-store";
import { Private } from "@/components/app/private";

const PAGE = 10;

interface Row {
  id: string;
  /** Día de la sesión (YYYY-MM-DD), para el filtro del calendario. */
  day: string;
  opened_at: string;
  instrument: string;
  direction: "buy" | "sell";
  with_spike: boolean;
  stake: number;
  r_multiple: number;
  outcome: Outcome;
  mood: string | null;
  violations: number;
  pending?: PendingTrade;
}

function pendingRow(p: PendingTrade): Row {
  const t = p.payload;
  const pnl = t.pnl ?? defaultPnl(t.result, t.stake, t.tp);
  const d = deriveTrade({ instrument: t.instrument, direction: t.direction, stake: t.stake, pnl, checklist: t.checklist });
  const openedAt = t.opened_at ?? new Date(p.createdAt).toISOString();
  return {
    id: t.id,
    day: localDate(openedAt),
    opened_at: openedAt,
    instrument: t.instrument,
    direction: t.direction,
    with_spike: d.with_spike,
    stake: t.stake,
    r_multiple: d.r_multiple,
    outcome: d.outcome,
    mood: t.mood,
    violations: 0,
    pending: p,
  };
}

const outcomeTone: Record<Outcome, string> = { win: "text-gain", loss: "text-loss", tie: "text-muted-foreground" };

export function TradesTable({ currency }: { currency: string }) {
  const router = useRouter();
  const { data, pending, selectedDay, setSelectedDay, retryPending, editPending, discardPending, startTrade } = useJournal();
  const [page, setPage] = useState(0);

  const serverIds = new Set(data.trades.map((t) => t.id));
  const pendingRows = pending.filter((p) => !serverIds.has(p.payload.id)).map(pendingRow);
  const all: Row[] = [...pendingRows.reverse(), ...data.trades.map((t) => ({ ...t, day: t.session_date }))];
  const rows = selectedDay ? all.filter((r) => r.day === selectedDay) : all;

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE, current * PAGE + PAGE);

  return (
    <Panel
      title="Operaciones"
      description={selectedDay ? dayLabel(selectedDay) : "Toca una fila para ver el detalle."}
      actions={
        selectedDay && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>
            Ver todo el mes
          </Button>
        )
      }
      bodyClassName="px-0 pb-0 sm:px-0 sm:pb-0"
    >

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3 px-4 pt-1 pb-5 text-sm text-muted-foreground sm:px-5">
          <p>
            {data.mode === "backtest"
              ? "Registra tu primera operación de backtesting: fecha, índice, resultado. Sin dinero real, con las mismas reglas."
              : "Registra tu primera operación para ver tu curva, tu calendario y tu disciplina."}
          </p>
          <Button variant="outline" onClick={startTrade}>
            Registrar operación
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-y bg-muted/30 text-left text-xs text-subtle">
                  <th className="px-4 py-2.5 font-normal sm:px-5">Fecha</th>
                  <th className="px-2 py-2 font-normal">Índice</th>
                  <th className="px-2 py-2 font-normal">Dirección</th>
                  <th className="px-2 py-2 font-normal">Spike</th>
                  <th className="px-2 py-2 text-right font-normal">Stake</th>
                  <th className="px-2 py-2 text-right font-normal">
                    <RHelp label="R" className="ml-auto" />
                  </th>
                  <th className="px-2 py-2 font-normal">Resultado</th>
                  <th className="px-2 py-2 font-normal">Estado</th>
                  <th className="w-8 px-2 py-2 font-normal"><span className="sr-only">Reglas</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    onClick={r.pending ? undefined : () => router.push(`/journal/${r.id}`)}
                    className={cn(
                      "border-b last:border-b-0",
                      r.pending ? "bg-muted/30" : "cursor-pointer hover:bg-muted/40",
                    )}
                  >
                    <td className="num px-4 py-3 sm:px-5 whitespace-nowrap text-muted-foreground">{dateTimeShort(r.opened_at)}</td>
                    <td className="px-2 py-3 whitespace-nowrap">{instrumentLabel(r.instrument)}</td>
                    <td className="px-2 py-3 text-muted-foreground">{DIRECTION_LABEL[r.direction]}</td>
                    <td className={cn("px-2 py-3 whitespace-nowrap", r.with_spike ? "text-muted-foreground" : "text-warn")}>
                      {r.with_spike ? "A favor" : "Contra"}
                    </td>
                    <td className="num px-2 py-3 text-right text-muted-foreground"><Private>{money(r.stake, currency)}</Private></td>
                    <td className={cn("num px-2 py-3 text-right font-medium", outcomeTone[r.outcome])}>{rValue(r.r_multiple)}</td>
                    <td className="px-2 py-3">
                      {r.pending ? <PendingCell p={r.pending} onRetry={retryPending} onEdit={editPending} onDiscard={discardPending} /> : (
                        <span className={outcomeTone[r.outcome]}>{OUTCOME_LABEL[r.outcome]}</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">{r.mood ? MOOD_LABEL[r.mood as keyof typeof MOOD_LABEL] : "—"}</td>
                    <td className="px-2 py-3">
                      {r.violations > 0 && (
                        <TriangleAlertIcon className="size-4 text-warn" aria-label={`Rompió ${r.violations} ${r.violations === 1 ? "regla" : "reglas"}`} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
              <span className="num">
                {current * PAGE + 1}–{Math.min(rows.length, current * PAGE + PAGE)} de {rows.length}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-sm" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Página anterior">
                  <ChevronLeftIcon />
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Página siguiente">
                  <ChevronRightIcon />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function PendingCell({
  p,
  onRetry,
  onEdit,
  onDiscard,
}: {
  p: PendingTrade;
  onRetry: (id: string) => void;
  onEdit: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  if (p.status !== "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <LoaderIcon className="size-3.5 animate-spin" />
        Guardando
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <span className="mr-1 text-loss" title={p.error}>No se guardó</span>
      <Button size="xs" variant="outline" onClick={() => onRetry(p.payload.id)}>
        Reintentar
      </Button>
      <Button size="xs" variant="ghost" onClick={() => onEdit(p.payload.id)}>
        Editar
      </Button>
      <Button size="xs" variant="ghost" onClick={() => onDiscard(p.payload.id)}>
        Descartar
      </Button>
    </span>
  );
}
