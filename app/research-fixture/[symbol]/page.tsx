import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FullReportPreview } from "../../../src/components/research/FullReportPreview";
import { ResearchRoom } from "../../../src/components/research/ResearchRoom";
import type { Locale } from "../../../src/lib/i18n";
import { findTicker } from "../../../src/lib/tickers";
import { committeeReportPreviewFixture } from "../../../src/research/committeeReportPreviewFixture";
import { fixtureComposition } from "../../../src/research/compositions/fixture";

type Props = {
  readonly params: Promise<{ readonly symbol: string }>;
  readonly searchParams: Promise<{
    readonly lang?: string;
    readonly view?: string;
    readonly version?: string;
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
  const locale: Locale = query.lang === "ko" ? "ko" : "en";
  const company = fixtureComposition.createCompany(
    ticker.symbol,
    ticker.company,
    ticker.exchange,
    ticker.sector,
  );
  if (query.version === "v2")
    return (
      <FullReportPreview
        company={company}
        report={committeeReportPreviewFixture()}
        reportId="committee-fixture"
        locale={locale}
      />
    );
  const payload = await fixtureComposition.createPayload();
  return (
    <ResearchRoom
      company={company}
      payload={payload}
      initialLocale={locale}
      initialComplete={query.view === "report"}
    />
  );
}
