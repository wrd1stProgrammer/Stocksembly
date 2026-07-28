import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResearchRoom } from "@/src/components/research/ResearchRoom";
import type { Locale } from "@/src/lib/i18n";
import { findTicker } from "@/src/lib/tickers";
import { fixtureComposition } from "@/src/research/compositions/fixture";

type Props = {
  readonly params: Promise<{ readonly symbol: string }>;
  readonly searchParams: Promise<{
    readonly lang?: string;
    readonly view?: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const ticker = findTicker(symbol);
  return { title: ticker ? `${ticker.symbol} research room` : "Research room" };
}

export default async function FixtureResearchPage({
  params,
  searchParams,
}: Props) {
  const [{ symbol }, query] = await Promise.all([params, searchParams]);
  const ticker = findTicker(symbol);
  if (!ticker) notFound();
  const payload = await fixtureComposition.createPayload();
  const locale: Locale = query.lang === "ko" ? "ko" : "en";
  const company = fixtureComposition.createCompany(
    ticker.symbol,
    ticker.company,
    ticker.exchange,
    ticker.sector,
  );
  return (
    <ResearchRoom
      company={company}
      payload={payload}
      initialLocale={locale}
      initialComplete={query.view === "report"}
    />
  );
}
