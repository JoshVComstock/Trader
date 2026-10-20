"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EquityPoint } from "@/lib/calc/metrics";
import { inLaPaz, money } from "@/lib/format";

function shortDate(date: string) {
  return inLaPaz(`${date}T16:00:00Z`, "d MMM");
}

const axisTick = { fill: "var(--subtle)", fontSize: 11, fontFamily: "var(--font-mono)" };

function TooltipBox({
  active,
  payload,
  currency,
  field,
}: {
  active?: boolean;
  payload?: readonly { payload: EquityPoint }[];
  currency: string;
  field: "equity" | "drawdown";
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">{shortDate(p.date)}</p>
      <p className="num mt-0.5 font-medium">
        {field === "equity" ? money(p.equity, currency) : p.drawdown === 0 ? "En máximos" : money(p.drawdown, currency)}
      </p>
    </div>
  );
}

/** Curva de capital arriba y drawdown desde el pico abajo, con el mismo eje de tiempo. */
export function EquityChart({ points, currency }: { points: EquityPoint[]; currency: string }) {
  if (points.length < 2) {
    return (
      <section aria-label="Curva de capital" className="flex h-56 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Registra tu primera operación del mes para ver tu curva.
      </section>
    );
  }

  const minDd = Math.min(...points.map((p) => p.drawdown));
  const ddFloor = minDd < 0 ? minDd : -1;
  const values = points.map((p) => p.equity);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.12, 1);

  return (
    <section aria-label="Curva de capital y drawdown" className="rounded-xl border bg-card px-2 pt-4 pb-2">
      <div className="flex items-baseline justify-between px-3">
        <h2 className="text-sm font-medium">Curva de capital</h2>
        <p className="num text-xs text-subtle">
          Máx. drawdown <span className={minDd < 0 ? "text-loss" : undefined}>{money(minDd, currency)}</span>
        </p>
      </div>

      <div className="h-48 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} syncId="equity" margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="date" hide />
            <YAxis
              domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => money(v, currency, 0)}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              content={(props) => <TooltipBox {...props} payload={props.payload as never} currency={currency} field="equity" />}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke="var(--brand)"
              strokeWidth={2}
              fill="url(#equityFill)"
              dot={false}
              activeDot={{ r: 3, fill: "var(--brand)", strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="h-20 sm:h-24">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} syncId="equity" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="date"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={shortDate}
              minTickGap={24}
            />
            <YAxis
              domain={[ddFloor, 0]}
              ticks={[ddFloor, 0]}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => money(v, currency, Math.abs(v) < 10 && v !== 0 ? 2 : 0)}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              content={(props) => <TooltipBox {...props} payload={props.payload as never} currency={currency} field="drawdown" />}
            />
            <Area
              type="monotone"
              dataKey="drawdown"
              stroke="var(--loss)"
              strokeWidth={1.5}
              fill="var(--loss)"
              fillOpacity={0.18}
              dot={false}
              activeDot={{ r: 3, fill: "var(--loss)", strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
