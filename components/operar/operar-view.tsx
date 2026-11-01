import Link from "next/link";
import { PageHeader, PageMain } from "@/components/app/layout";
import { MonthCalendar } from "@/components/journal/calendar";
import { JournalProvider } from "@/components/journal/journal-context";
import { journalClientData } from "@/components/journal/journal-view";
import { Reminders } from "@/components/journal/reminders";
import { RegisterFab, TopBar } from "@/components/journal/top-bar";
import { TradesTable } from "@/components/journal/trades-table";
import { Button } from "@/components/ui/button";
import { calendarWeeks } from "@/lib/calc/metrics";
import type { JournalData } from "@/lib/data";
import { monthRange } from "@/lib/time-core";
import { BalanceCard } from "./balance-card";
import { TodayCard } from "./today-card";

/**
 * Vista limpia para el día a día: hoy (check-in, reloj, meta, registrar), el calendario,
 * las operaciones y el balance con retiros. Las estadísticas quedan en la Bitácora.
 */
export function OperarView({ data }: { data: JournalData }) {
  const { account } = data;

  if (!account) {
    return (
      <>
        <PageMain className="max-w-2xl py-16">
          <PageHeader
            title="Crea tu primera cuenta de trading"
            description="Indica con cuánto empiezas (en dólares). Tus reglas ya vienen configuradas; las puedes cambiar en Ajustes."
          />
          <Button asChild size="lg">
            <Link href="/ajustes?nueva=real#cuentas">Crear cuenta</Link>
          </Button>
        </PageMain>
      </>
    );
  }

  const { from, to } = monthRange(data.month);
  const weeks = calendarWeeks(
    data.month,
    data.daily.filter((d) => d.date >= from && d.date <= to),
  );

  return (
    <JournalProvider key={account.id} data={journalClientData(data, account)}>
      <TopBar mode="live" accounts={data.accounts} accountId={account.id} month={data.month} today={data.today} />

      <PageMain>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_25rem] 2xl:grid-cols-[minmax(0,1fr)_28rem]">
          <div className="min-w-0 space-y-5">
            <TodayCard />
            <MonthCalendar weeks={weeks} today={data.today} currency={account.currency} />
          </div>
          <aside className="space-y-5 lg:sticky lg:top-32">
            <BalanceCard account={account} cashflows={data.cashflows} today={data.today} />
          </aside>
        </div>

        <TradesTable currency={account.currency} />
      </PageMain>

      {data.settings.psych.notifications && <Reminders />}
      <RegisterFab />
    </JournalProvider>
  );
}
