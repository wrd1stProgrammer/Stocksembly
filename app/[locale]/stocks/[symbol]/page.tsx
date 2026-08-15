import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StockResearchHubPage } from "@/src/components/seo/StockResearchHubPage";
import { isLocale } from "@/src/lib/i18n";
import {
  stockResearchHubMetadata,
  unavailableStockResearchHubMetadata,
} from "@/src/lib/seo/stockResearchHubMetadata";
import { getStockResearchHubPageData } from "@/src/research/server/researchRoom/stockResearchHubPageData";

export const dynamic = "force-dynamic";

type Props = Readonly<{
  params: Promise<{ readonly locale: string; readonly symbol: string }>;
}>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, symbol } = await params;
  if (!isLocale(locale)) return {};
  const hub = await getStockResearchHubPageData(symbol);
  return hub === undefined
    ? unavailableStockResearchHubMetadata(locale)
    : stockResearchHubMetadata(locale, hub);
}

export default async function LocalizedStockResearchHubPage({ params }: Props) {
  const { locale, symbol } = await params;
  if (!isLocale(locale)) notFound();
  const hub = await getStockResearchHubPageData(symbol);
  if (hub === undefined) notFound();
  return <StockResearchHubPage hub={hub} locale={locale} />;
}
