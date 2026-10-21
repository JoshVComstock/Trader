import Link from "next/link";
import { AppHeader } from "@/components/app/app-header";
import { PageHeader, PageMain } from "@/components/app/layout";
import { Button } from "@/components/ui/button";
import {
  byHour,
  byInstrument,
  bySpike,
  calendarWeeks,
  computeKpis,
  currentBalance,
  equityCurve,
} from "@/lib/calc/metrics";
import type { JournalData } from "@/lib/data";
import { monthRange } from "@/lib/time-core";
import { ByHourCard, ByInstrumentCard, SpikeCard } from "./breakdowns";
import { MonthCalendar } from "./calendar";
import { DisciplineStrip } from "./discipline-strip";
import { EquityChart } from "./equity-chart";
import { JournalProvider } from "./journal-context";
import { KpiRow } from "./kpis";
import { RegisterFab, TopBar } from "./top-bar";
import { TradesTable } from "./trades-table";

/** La página del journal: una sola, siete bloques, de arriba abajo. */
export function JournalView({ data }: { data: JournalData }) {
  const { account, mode } = data;

  if (!account) {
    return (
      <>
        <AppHeader />
        <PageMain className="max-w-2xl py-16">
          <PageHeader
            title={mode === "backtest" ? "Crea una cuenta de backtesting" : "Crea tu primera cuenta de trading"}
            description={
              mode === "backtest"
                ? "El backtesting vive en cuentas aparte, sin dinero real: así tus estadísticas reales no se mezclan con las de práctica."
                : "Indica con cuánto empiezas (en dólares) y registra tu primera operación. Tus reglas ya vienen configuradas; las puedes cambiar en Ajustes."
            }
          />
          <Button asChild size="lg">
            <Link href={`/ajustes?nueva=${mode === "backtest" ? "backtest" : "real"}#cuentas`}>Crear cuenta</Link>
          </Button>
        </PageMain>
      </>
    );
  }

  const { from, to } = monthRange(data.month);
  const monthRows = data.daily.filter((d) => d.date >= from && d.date <= to);
  const kpis = computeKpis(monthRows);
  const totals = monthRows.reduce(
    (acc, d) => ({
      wins: acc.wins + d.wins,
      losses: acc.losses + d.losses,
      gp: acc.gp + d.gross_profit,
      gl: acc.gl + d.gross_loss,
    }),
    { wins: 0, losses: 0, gp: 0, gl: 0 },
  );
  const curve = equityCurve(account.start_balance, data.daily, data.month);
  const weeks = calendarWeeks(data.month, monthRows);
  const spike = bySpike(data.trades);
  const balance = currentBalance(account.start_balance, data.daily);

  return (
    <JournalProvider
      key={account.id}
      data={{
        mode,
        account,
        strategies: data.strategies,
        rules: data.rules,
        session: data.session,
        sessionTrades: data.sessionTrades,
        trades: data.trades,
        lastTrade: data.lastTrade,
        balance,
        today: data.today,
      }}
    >
      {/* 1 · Barra superior */}
      <TopBar mode={mode} accounts={data.accounts} accountId={account.id} month={data.month} today={data.today} />

      <PageMain>
        {mode === "backtest" && (
          <p className="text-sm text-muted-foreground">
            Backtesting: operaciones sobre datos históricos, sin dinero real. Las reglas y las métricas funcionan igual que en tu cuenta real.
          </p>
        )}

        {/* 2 · Cuatro números grandes */}
        <KpiRow
          kpis={kpis}
          wins={totals.wins}
          losses={totals.losses}
          grossProfit={totals.gp}
          grossLoss={totals.gl}
          currency={account.currency}
        />

        {/* 3 · Tira de disciplina */}
        <DisciplineStrip />

        {/* 4 · Curva de capital + drawdown */}
        <EquityChart points={curve} currency={account.currency} />

        {/* 5 · Calendario */}
        <MonthCalendar weeks={weeks} today={data.today} currency={account.currency} />

        {/* 6 · Tres tarjetas */}
        <div className="grid gap-5 lg:grid-cols-3">
          <ByInstrumentCard buckets={byInstrument(data.trades)} />
          <SpikeCard withSpike={spike.with} against={spike.against} />
          <ByHourCard buckets={byHour(data.trades)} />
        </div>

        {/* 7 · Tabla de operaciones */}
        <TradesTable currency={account.currency} />
      </PageMain>

      <RegisterFab />
    </JournalProvider>
  );
}
