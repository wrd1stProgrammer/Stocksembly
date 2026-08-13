import { ArrowRight, CalendarDays, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Locale } from "../../lib/i18n";
import { stockResearchHubCopy } from "../../lib/seo/stockResearchHubCopy";
import { stockResearchHubPaths } from "../../lib/seo/stockResearchHubMetadata";
import { researchTargetQueryValue } from "../../research/domain/researchTarget";
import type { StockResearchHub } from "../../research/server/researchRoom/stockResearchHubCatalog";
import { LandingFooter } from "../LandingSections";
import { SeoLocaleHeader } from "./UsStockAnalysisHeader";

type StockResearchHubPageProps = Readonly<{
  hub: StockResearchHub;
  locale: Locale;
}>;

function publishedDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function StockResearchHubPage({
  hub,
  locale,
}: StockResearchHubPageProps) {
  const content = stockResearchHubCopy[locale];
  const paths = stockResearchHubPaths(hub.symbol);
  const canonicalUrl = `https://stocksembly.com${paths[locale]}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: content.title(hub.company, hub.symbol),
    description: content.description(hub.company, hub.symbol),
    url: canonicalUrl,
    inLanguage: locale === "ko" ? "ko-KR" : "en-US",
    about: {
      "@type": "Corporation",
      name: hub.company,
      tickerSymbol: hub.symbol,
    },
    isPartOf: {
      "@type": "WebSite",
      name: "Stocksembly",
      url: "https://stocksembly.com",
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: hub.reports.length,
      itemListElement: hub.reports.map((report, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: report.question,
        url:
          locale === "en"
            ? `https://stocksembly.com/research-room/${report.reportId}?lang=en`
            : `https://stocksembly.com/research-room/${report.reportId}`,
      })),
    },
  };

  return (
    <div className="stock-hub-page" lang={locale}>
      <SeoLocaleHeader locale={locale} paths={paths} />
      <main>
        <section className="stock-hub-hero">
          <div className="stock-hub-identity" aria-hidden="true">
            {hub.symbol.slice(0, 1)}
          </div>
          <div>
            <p className="stock-hub-eyebrow">{content.eyebrow}</p>
            <h1>{content.title(hub.company, hub.symbol)}</h1>
            <p className="stock-hub-hero__description">
              {content.description(hub.company, hub.symbol)}
            </p>
            <span className="stock-hub-count">
              {content.reportCount(hub.reports.length)}
            </span>
          </div>
        </section>

        <aside className="stock-hub-disclosure">
          <ShieldCheck aria-hidden="true" size={22} />
          <div>
            <strong>{content.disclosureTitle}</strong>
            <p>{content.disclosure}</p>
          </div>
        </aside>

        <section className="stock-hub-archive">
          <header>
            <p className="stock-hub-eyebrow">{content.archiveEyebrow}</p>
            <h2>{content.archiveTitle}</h2>
            <p>{content.archiveDescription}</p>
          </header>
          <div className="stock-hub-report-list">
            {hub.reports.map((report) => {
              const scope = researchTargetQueryValue(report.researchTarget);
              const href =
                locale === "en"
                  ? `/research-room/${report.reportId}?lang=en`
                  : `/research-room/${report.reportId}`;
              return (
                <article key={report.reportId}>
                  <div className="stock-hub-report__meta">
                    <span>{content.scope[scope]}</span>
                    <span>
                      {report.status === "complete_with_limitations"
                        ? content.limitationStatus
                        : content.completeStatus}
                    </span>
                    <time dateTime={report.publishedAt}>
                      <CalendarDays aria-hidden="true" size={14} />
                      {publishedDate(report.publishedAt, locale)}
                    </time>
                  </div>
                  <h3>
                    <Link href={href}>{report.question}</Link>
                  </h3>
                  <Link className="stock-hub-report__action" href={href}>
                    {content.readReport}
                    <ArrowRight aria-hidden="true" size={15} />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        <section className="stock-hub-closing">
          <div>
            <h2>{content.closingTitle}</h2>
            <p>{content.closingDescription}</p>
          </div>
          <div>
            <Link href={`/?lang=${locale}#product`}>
              {content.startResearch}
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
            <Link href={`/research-room?lang=${locale}`}>
              {content.browseArchive}
            </Link>
          </div>
        </section>
      </main>
      <LandingFooter locale={locale} />
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </div>
  );
}
