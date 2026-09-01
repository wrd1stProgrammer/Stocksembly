import "../../styles/seo-analysis.css";
import "../../styles/seo-analysis-responsive.css";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { AppLocale } from "../../lib/i18n";
import { intlLocale } from "../../lib/i18n";
import {
  US_STOCK_ANALYSIS_PATHS,
  usStockAnalysisContent,
} from "../../lib/seo/usStockAnalysis";
import { LandingFooter } from "../LandingSections";
import { UsStockAnalysisHeader } from "./UsStockAnalysisHeader";

type UsStockAnalysisLandingProps = Readonly<{
  locale: AppLocale;
}>;

function localizedHref(path: string, locale: AppLocale): string {
  return `${path}?lang=${locale}`;
}

export function UsStockAnalysisLanding({
  locale,
}: UsStockAnalysisLandingProps) {
  const content = usStockAnalysisContent(locale);
  const startHref = `/?lang=${locale}#product`;
  const researchRoomHref = `/research-room?lang=${locale}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: content.metadata.title,
    description: content.metadata.description,
    url: `https://stocksembly.com${US_STOCK_ANALYSIS_PATHS[locale]}`,
    inLanguage: intlLocale(locale),
    isPartOf: {
      "@type": "WebSite",
      name: "Stocksembly",
      url: "https://stocksembly.com",
    },
    publisher: {
      "@type": "Organization",
      name: "SERN",
      url: "https://stocksembly.com/about",
    },
  };

  return (
    <div className="seo-analysis-page" lang={locale}>
      <UsStockAnalysisHeader locale={locale} />
      <main>
        <section className="seo-analysis-hero">
          <div className="seo-analysis-hero__copy">
            <p className="seo-analysis-eyebrow">{content.hero.eyebrow}</p>
            <h1>{content.hero.title}</h1>
            <p className="seo-analysis-hero__description">
              {content.hero.description}
            </p>
            <div className="seo-analysis-actions">
              <Link className="seo-analysis-action is-primary" href={startHref}>
                {content.hero.primaryAction}
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
              <Link
                className="seo-analysis-action is-secondary"
                href={researchRoomHref}
              >
                {content.hero.secondaryAction}
              </Link>
            </div>
          </div>
          <ul className="seo-analysis-hero__proof">
            {content.hero.proof.map((point) => (
              <li key={point}>
                <CheckCircle2 aria-hidden="true" size={18} />
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section className="seo-analysis-section">
          <header className="seo-analysis-section__header">
            <p className="seo-analysis-eyebrow">{content.analysis.eyebrow}</p>
            <h2>{content.analysis.title}</h2>
            <p className="seo-analysis-section__description">
              {content.analysis.description}
            </p>
          </header>
          <div className="seo-analysis-grid">
            {content.analysis.cards.map((card) => (
              <article key={card.title}>
                <h3>{card.title}</h3>
                <p className="seo-analysis-card__description">
                  {card.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="seo-analysis-section seo-analysis-committee">
          <header className="seo-analysis-section__header">
            <p className="seo-analysis-eyebrow">{content.committee.eyebrow}</p>
            <h2>{content.committee.title}</h2>
            <p className="seo-analysis-section__description">
              {content.committee.description}
            </p>
          </header>
          <div className="seo-analysis-team-grid">
            {content.committee.teams.map((team) => (
              <article key={team.title}>
                <h3>{team.title}</h3>
                <p className="seo-analysis-card__description">
                  {team.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="seo-analysis-section">
          <header className="seo-analysis-section__header">
            <p className="seo-analysis-eyebrow">{content.process.eyebrow}</p>
            <h2>{content.process.title}</h2>
          </header>
          <ol className="seo-analysis-process">
            {content.process.steps.map((step) => (
              <li key={step.number}>
                <span>{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p className="seo-analysis-process__description">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <Link
            className="seo-analysis-text-link"
            href={localizedHref("/methodology", locale)}
          >
            {content.process.methodologyAction}
            <ArrowRight aria-hidden="true" size={15} />
          </Link>
        </section>

        <section className="seo-analysis-section seo-analysis-standards">
          <div>
            <p className="seo-analysis-eyebrow">{content.standards.eyebrow}</p>
            <h2>{content.standards.title}</h2>
            <p className="seo-analysis-standards__description">
              {content.standards.description}
            </p>
            <Link
              className="seo-analysis-text-link"
              href={localizedHref("/editorial-policy", locale)}
            >
              {content.standards.editorialAction}
              <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </div>
          <ul>
            {content.standards.points.map((point) => (
              <li key={point}>
                <CheckCircle2 aria-hidden="true" size={18} />
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section className="seo-analysis-section">
          <header className="seo-analysis-section__header">
            <p className="seo-analysis-eyebrow">{content.questions.eyebrow}</p>
            <h2>{content.questions.title}</h2>
          </header>
          <div className="seo-analysis-questions">
            {content.questions.items.map((item) => (
              <article key={item.title}>
                <h3>{item.title}</h3>
                <p className="seo-analysis-card__description">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="seo-analysis-closing">
          <div>
            <h2>{content.closing.title}</h2>
            <p className="seo-analysis-closing__description">
              {content.closing.description}
            </p>
          </div>
          <Link className="seo-analysis-action is-primary" href={startHref}>
            {content.closing.action}
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </section>
      </main>
      <LandingFooter locale={locale} />
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </div>
  );
}
