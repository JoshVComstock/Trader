import { cn } from "@/lib/utils";
import { Panel } from "@/components/app/layout";
import type { Bucket } from "@/lib/calc/metrics";
import { compactMoney, percent, rValue } from "@/lib/format";
import { Private } from "@/components/app/private";

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Panel title={title} description={subtitle}>
      {children}
    </Panel>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground">Registra operaciones este mes para ver el desglose.</p>;
}

const signTone = (v: number) => (v > 0 ? "text-gain" : v < 0 ? "text-loss" : "text-muted-foreground");

/** Por índice: barra de win rate y R acumulada. */
export function ByInstrumentCard({ buckets }: { buckets: Bucket[] }) {
  return (
    <Card title="Por índice" subtitle="Win rate y R acumulada">
      {buckets.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-2.5">
          {buckets.map((b) => (
            <li key={b.key}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate">
                  {b.label} <span className="text-subtle">· {b.trades}</span>
                </span>
                <span className="num flex gap-3">
                  <span className="text-muted-foreground">{percent(b.winRate)}</span>
                  <span className={cn("w-16 text-right", signTone(b.r))}>{rValue(b.r)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-foreground/45" style={{ width: `${(b.winRate ?? 0) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A favor vs contra el spike: el gráfico más importante de la página. */
export function SpikeCard({ withSpike, against }: { withSpike: Bucket; against: Bucket }) {
  const total = withSpike.trades + against.trades;
  const maxAbs = Math.max(Math.abs(withSpike.r), Math.abs(against.r), 1);
  const rows = [
    { b: withSpike, hint: "Comprar en Boom, vender en Crash" },
    { b: against, hint: "Vender en Boom, comprar en Crash" },
  ];
  return (
    <Card title="A favor vs contra el spike" subtitle={total ? `${Math.round((against.trades / total) * 100)}% de tus operaciones fueron contra el spike` : undefined}>
      {total === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-4">
          {rows.map(({ b, hint }) => (
            <li key={b.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm">{b.label}</span>
                <span className={cn("num text-lg font-semibold", signTone(b.r))}>{rValue(b.r)}</span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", b.r >= 0 ? "bg-gain" : "bg-loss")}
                  style={{ width: `${(Math.abs(b.r) / maxAbs) * 100}%` }}
                />
              </div>
              <p className="num mt-1 text-xs text-subtle">
                {b.trades} op · {percent(b.winRate)} win rate · <Private>{compactMoney(b.pnl)}</Private> · {hint}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** P/L por franja horaria, en barras divergentes desde el centro. */
export function ByHourCard({ buckets }: { buckets: Bucket[] }) {
  const maxAbs = Math.max(1, ...buckets.map((b) => Math.abs(b.pnl)));
  return (
    <Card title="Por hora del día" subtitle="P/L por franja, hora de La Paz">
      {buckets.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-1.5">
          {buckets.map((b) => {
            const w = (Math.abs(b.pnl) / maxAbs) * 50;
            return (
              <li key={b.key} className="grid grid-cols-[2.75rem_1fr_3.5rem] items-center gap-2 text-xs">
                <span className="num text-muted-foreground">{b.label}</span>
                <div className="relative h-3">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  <div
                    className={cn("absolute inset-y-0.5 rounded-sm", b.pnl >= 0 ? "bg-gain" : "bg-loss")}
                    style={b.pnl >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                  />
                </div>
                <span className={cn("num text-right", signTone(b.pnl))}><Private>{compactMoney(b.pnl)}</Private></span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
