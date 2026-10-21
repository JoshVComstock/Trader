"use client";

import { cn } from "@/lib/utils";
import { Panel } from "@/components/app/layout";
import { Button } from "@/components/ui/button";
import type { CalendarWeek } from "@/lib/calc/metrics";
import { compactMoney, signedMoney } from "@/lib/format";
import { useJournal } from "./journal-context";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Fondo según signo e intensidad, mezclando el color de ganancia/pérdida con transparente. */
function cellBackground(pnl: number, maxAbs: number): string | undefined {
  if (pnl === 0 || maxAbs === 0) return undefined;
  const strength = Math.round(8 + (Math.abs(pnl) / maxAbs) * 30);
  return `color-mix(in oklch, var(${pnl > 0 ? "--gain" : "--loss"}) ${strength}%, transparent)`;
}

export function MonthCalendar({ weeks, today, currency }: { weeks: CalendarWeek[]; today: string; currency: string }) {
  const { selectedDay, setSelectedDay } = useJournal();
  const maxAbs = Math.max(0, ...weeks.flatMap((w) => w.cells.map((c) => Math.abs(c.day?.pnl ?? 0))));
  // Las semanas sin ningún día del mes (la sexta, a veces) no se muestran.
  const visible = weeks.filter((w) => w.cells.some((c) => c.inMonth));

  return (
    <Panel
      title="Calendario"
      description="Toca un día para ver sus operaciones. El punto indica si respetaste todas tus reglas."
      actions={
        selectedDay && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>
            Quitar filtro de día
          </Button>
        )
      }
      bodyClassName="overflow-x-auto px-2 sm:px-3"
    >
      <div className="grid min-w-[44rem] grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.15fr)] gap-1.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 pb-1 text-xs text-subtle">
            {d}
          </div>
        ))}
        <div className="px-2 pb-1 text-xs text-subtle">Semana</div>

          {visible.map((week) => (
            <Week key={week.cells[0].date} week={week} maxAbs={maxAbs} today={today} currency={currency} selected={selectedDay} onSelect={setSelectedDay} />
        ))}
      </div>
    </Panel>
  );
}

function Week({
  week,
  maxAbs,
  today,
  currency,
  selected,
  onSelect,
}: {
  week: CalendarWeek;
  maxAbs: number;
  today: string;
  currency: string;
  selected: string | null;
  onSelect: (d: string | null) => void;
}) {
  const s = week.summary;
  const wr = s.wins + s.losses > 0 ? Math.round((s.wins / (s.wins + s.losses)) * 100) : null;
  return (
    <>
      {week.cells.map((cell) => {
        const d = cell.day;
        const dayNum = Number(cell.date.slice(8));
        if (!cell.inMonth) return <div key={cell.date} className="min-h-[5.5rem] rounded-md" />;
        const isSelected = selected === cell.date;
        const winRate = d && d.wins + d.losses > 0 ? Math.round((d.wins / (d.wins + d.losses)) * 100) : null;
        return (
          <button
            key={cell.date}
            type="button"
            disabled={!d}
            onClick={() => onSelect(isSelected ? null : cell.date)}
            aria-pressed={isSelected}
            aria-label={d ? `Día ${dayNum}: ${signedMoney(d.pnl, currency)}, ${d.trades} operaciones` : `Día ${dayNum}, sin operaciones`}
            className={cn(
              "relative flex min-h-[5.5rem] flex-col items-start rounded-md border border-transparent p-1.5 text-left transition-colors",
              d ? "hover:border-foreground/20" : "cursor-default bg-muted/30",
              isSelected && "border-brand ring-1 ring-brand",
            )}
            style={{ backgroundColor: d ? cellBackground(d.pnl, maxAbs) : undefined }}
          >
            <span className={cn("num text-xs", cell.date === today ? "font-semibold text-brand" : "text-subtle")}>{dayNum}</span>
            {d && (
              <>
                <span className={cn("num mt-auto text-base font-semibold", d.pnl > 0 ? "text-gain" : d.pnl < 0 ? "text-loss" : "text-foreground")}>
                  {compactMoney(d.pnl)}
                </span>
                <span className="num text-[11px] text-muted-foreground">
                  {d.trades} op{winRate !== null && ` · ${winRate}%`}
                </span>
                <span
                  className={cn(
                    "absolute top-1.5 right-1.5 size-1.5 rounded-full",
                    d.compliance_pct >= 100 ? "bg-foreground/60" : "border border-warn bg-transparent",
                  )}
                  title={d.compliance_pct >= 100 ? "Respetaste todas tus reglas" : "Rompiste alguna regla"}
                />
              </>
            )}
          </button>
        );
      })}
      <div className="flex min-h-[5.5rem] flex-col justify-end rounded-md bg-muted/40 p-1.5">
        {s.trades > 0 ? (
          <>
            <span className={cn("num text-base font-semibold", s.pnl > 0 ? "text-gain" : s.pnl < 0 ? "text-loss" : "text-foreground")}>
              {compactMoney(s.pnl)}
            </span>
            <span className="num text-[11px] text-muted-foreground">
              {s.trades} op{wr !== null && ` · ${wr}%`}
            </span>
          </>
        ) : (
          <span className="text-[10px] text-subtle">—</span>
        )}
      </div>
    </>
  );
}
