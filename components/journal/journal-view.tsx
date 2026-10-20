import Link from "next/link";
import { Logo } from "@/components/app/logo";
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
import { AppMenu, RegisterFab, TopBar } from "./top-bar";
import { TradesTable } from "./trades-table";

/** La página del journal: una sola, siete bloques, de arriba abajo. */
export function JournalView({ data }: { data: JournalData }) {
  const { account, mode } = data;

  if (!account) {
    return (
      <>
        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5">
            <Logo className="size-6" />
            <AppMenu mode={mode} />
          </div>
        </header>
        <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-16">
          <h1 className="text-xl font-semibold">
            {mode === "backtest" ? "Crea una cuenta de backtesting" : "Crea tu primera cuenta de trading"}
          </h1>
          <p className="text-muted-foreground">
            {mode === "backtest"
              ? "El backtesting vive en cuentas aparte, sin dinero real: así tus estadísticas reales no se mezclan con las de práctica."
              : "Indica con cuánto empiezas (real o demo) y registra tu primera operación. Tus reglas ya vienen configuradas; las puedes cambiar en Ajustes."}
          </p>
          <Button asChild>
            <Link href={`/ajustes?nueva=${mode === "backtest" ? "backtest" : "real"}#cuentas`}>Crear cuenta</Link>
          </Button>
        </main>
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

      <main className="mx-auto max-w-6xl space-y-4 px-4 pt-4 pb-28 sm:space-y-5 sm:pb-12">
        {mode === "backtest" && (
          <p className="text-xs text-muted-foreground">
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
        <div className="grid gap-4 md:grid-cols-3">
          <ByInstrumentCard buckets={byInstrument(data.trades)} />
          <SpikeCard withSpike={spike.with} against={spike.against} />
          <ByHourCard buckets={byHour(data.trades)} />
        </div>

        {/* 7 · Tabla de operaciones */}
        <TradesTable currency={account.currency} />
      </main>

      <RegisterFab />
    </JournalProvider>
  );
}
