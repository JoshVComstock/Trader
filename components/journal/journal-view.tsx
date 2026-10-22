import Link from "next/link";
import { AppHeader } from "@/components/app/app-header";
import { PageHeader, PageMain } from "@/components/app/layout";
import { Button } from "@/components/ui/button";
import { CalendarCheckIcon } from "lucide-react";
import {
  byAnxiety,
  byMood,
  byHour,
  byInstrument,
  bySpike,
  calendarWeeks,
  computeKpis,
  currentBalance,
  equityCurve,
} from "@/lib/calc/metrics";
import type { JournalData } from "@/lib/data";
import { disciplineStreak } from "@/lib/psych";
import { monthRange } from "@/lib/time-core";
import { ByHourCard, ByInstrumentCard, SpikeCard } from "./breakdowns";
import { MonthCalendar } from "./calendar";
import { DisciplineStrip } from "./discipline-strip";
import { EquityChart } from "./equity-chart";
import { JournalProvider } from "./journal-context";
import { KpiRow } from "./kpis";
import { MoodComparison } from "./mood-comparison";
import { ObservationsPanel } from "./observations-panel";
import { Reminders } from "./reminders";
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
  const psych = data.settings.psych;
  const streak = psych.discipline_streak && mode === "live" ? disciplineStreak(data.daily) : null;
  const moods = psych.mood_comparison ? byMood(data.trades) : null;

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
        settings: data.settings,
        calmMessages: data.calmMessages,
        lastReview: data.lastReview,
        observations: data.observations,
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
          streak={streak}
        />

        {data.reviewDue && mode === "live" && (
          <Link
            href="/revision"
            className="flex items-center gap-3 rounded-xl border border-brand/40 bg-brand/10 px-5 py-4 transition-colors hover:bg-brand/15"
          >
            <CalendarCheckIcon className="size-5 shrink-0 text-brand" />
            <span className="min-w-0">
              <span className="block font-medium">Es domingo: revisa tu semana</span>
              <span className="block text-sm text-muted-foreground">
                Tu mejor y tu peor operación, la regla que más rompiste y qué cambias la semana que viene.
              </span>
            </span>
          </Link>
        )}

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

        {moods && (
          <MoodComparison
            calm={moods.calm}
            rushed={moods.rushed}
            tired={moods.tired}
            anxiety={psych.anxiety_scale ? byAnxiety(data.trades) : null}
          />
        )}

        {/* 7 · Tabla de operaciones */}
        <TradesTable currency={account.currency} />

        {/* Backtesting: zonas y patrones que vas notando, para llevarlos a la cuenta real. */}
        {mode === "backtest" && <ObservationsPanel accountId={account.id} />}
      </PageMain>

      {mode === "live" && psych.notifications && <Reminders />}

      <RegisterFab />
    </JournalProvider>
  );
}
