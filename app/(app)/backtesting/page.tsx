import type { Metadata } from "next";
import { JournalView } from "@/components/journal/journal-view";
import { getJournalData } from "@/lib/data";

export const metadata: Metadata = { title: "Backtesting" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function BacktestingPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const data = await getJournalData({ mode: "backtest", accountId: one(sp.cuenta), month: one(sp.mes) });
  return <JournalView data={data} />;
}
