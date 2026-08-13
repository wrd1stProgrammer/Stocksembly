import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StockResearchHubPage } from "@/src/components/seo/StockResearchHubPage";
import {
  stockResearchHubMetadata,
  unavailableStockResearchHubMetadata,
} from "@/src/lib/seo/stockResearchHubMetadata";
import { getStockResearchHubPageData } from "@/src/research/server/researchRoom/stockResearchHubPageData";

export const dynamic = "force-dynamic";

type Props = Readonly<{
  params: Promise<{ readonly symbol: string }>;
}>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const hub = await getStockResearchHubPageData(symbol);
  return hub === undefined
    ? unavailableStockResearchHubMetadata("ko")
    : stockResearchHubMetadata("ko", hub);
}

export default async function KoreanStockResearchHubPage({ params }: Props) {
  const { symbol } = await params;
  const hub = await getStockResearchHubPageData(symbol);
  if (hub === undefined) notFound();
  return <StockResearchHubPage hub={hub} locale="ko" />;
}
