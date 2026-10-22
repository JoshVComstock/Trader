import { cn } from "@/lib/utils";
import type { Kpis } from "@/lib/calc/metrics";
import { decimal, money, percent, rValue, signedMoney } from "@/lib/format";
import type { Streak } from "@/lib/psych";
import { RHelp } from "./r-help";

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
  streak,
  avgStake,
}: {
  kpis: Kpis;
  wins: number;
  losses: number;
  grossProfit: number;
  grossLoss: number;
  currency: string;
  /** Racha de disciplina; si viene, se muestra como quinto número. */
  streak?: Streak | null;
  /** Stop promedio del mes, para traducir la esperanza en R a dólares. */
  avgStake?: number | null;
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
      help: true,
      value: kpis.expectancyR === null ? "—" : rValue(kpis.expectancyR),
      className: tone(kpis.expectancyR),
      sub:
        kpis.expectancyR !== null && avgStake
          ? `≈ ${signedMoney(kpis.expectancyR * avgStake, currency)} por operación`
          : "por operación",
    },
  ];

  if (streak) {
    items.push({
      label: "Racha de disciplina",
      value: `${streak.current} ${streak.current === 1 ? "día" : "días"}`,
      className: streak.current > 0 ? "text-brand" : "text-muted-foreground",
      sub: streak.brokenOnLast
        ? `Se cortó el último día · mejor ${streak.best}`
        : `Respetando todas tus reglas · mejor ${streak.best}`,
    });
  }

  return (
    <section
      aria-label="Resumen del mes"
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border",
        streak ? "lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1" : "lg:grid-cols-4",
      )}
    >
      {items.map((it) => (
        <div key={it.label} className="bg-card px-4 py-5 sm:px-6">
          <p className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            {it.label}
            {"help" in it && it.help && <RHelp label="¿R?" />}
          </p>
          <p className={cn("num mt-2 text-3xl font-semibold tracking-tight sm:text-4xl", it.className)}>{it.value}</p>
          <p className="num mt-1.5 truncate text-sm text-subtle">{it.sub}</p>
        </div>
      ))}
    </section>
  );
}
