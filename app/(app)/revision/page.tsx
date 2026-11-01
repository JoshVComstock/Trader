import type { Metadata } from "next";
import { PageMain } from "@/components/app/layout";
import { ReviewView } from "@/components/review/review-view";
import { getReviewData } from "@/lib/data";

export const metadata: Metadata = { title: "Revisión semanal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const data = await getReviewData(typeof sp.semana === "string" ? sp.semana : undefined);
  return (
    <>
      <PageMain>
        <ReviewView data={data} />
      </PageMain>
    </>
  );
}
