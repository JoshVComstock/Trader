import type { Metadata } from "next";
import { OperarView } from "@/components/operar/operar-view";
import { getJournalData } from "@/lib/data";

export const metadata: Metadata = { title: "Operar" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function OperarPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const data = await getJournalData({ mode: "live", accountId: one(sp.cuenta), month: one(sp.mes) });
  return <OperarView data={data} />;
}
