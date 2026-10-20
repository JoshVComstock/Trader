import { cn } from "@/lib/utils";
import type { Kpis } from "@/lib/calc/metrics";
import { decimal, money, percent, rValue, signedMoney } from "@/lib/format";

function tone(value: number | null) {
  if (value === null || value === 0) return "text-foreground";
  return value > 0 ? "text-gain" : "text-loss";
}

/** Cuatro números grandes a todo color; lo secundario, apagado. */
export function KpiRow({
  kpis,
  wins,
  losses,
  grossProfit,
  grossLoss,
  currency,
}: {
  kpis: Kpis;
  wins: number;
  losses: number;
  grossProfit: number;
  grossLoss: number;
  currency: string;
}) {
  const items = [
    {
      label: "Neto del mes",
      value: kpis.trades ? signedMoney(kpis.net, currency) : "—",
      className: tone(kpis.trades ? kpis.net : null),
      sub: `${kpis.trades} ${kpis.trades === 1 ? "operación" : "operaciones"}`,
    },
    {
      label: "Win rate",
      value: percent(kpis.winRate),
      className: "text-foreground",
      sub: `${wins} ganadas · ${losses} perdidas`,
    },
    {
      label: "Profit factor",
      value: decimal(kpis.profitFactor),
      className: "text-foreground",
      sub: `${money(grossProfit, currency)} / ${money(grossLoss, currency)}`,
    },
    {
      label: "Esperanza",
      value: kpis.expectancyR === null ? "—" : rValue(kpis.expectancyR),
      className: tone(kpis.expectancyR),
      sub: "por operación",
    },
  ];

  return (
    <section aria-label="Resumen del mes" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="bg-card px-4 py-4 sm:px-5">
          <p className="text-xs text-muted-foreground">{it.label}</p>
          <p className={cn("num mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl", it.className)}>{it.value}</p>
          <p className="num mt-1 truncate text-xs text-subtle">{it.sub}</p>
        </div>
      ))}
    </section>
  );
}
