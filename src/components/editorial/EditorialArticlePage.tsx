import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { editorialDefinition, editorialPath } from "../../editorial/catalog";
import { editorialContent } from "../../editorial/content";
import type { EditorialDefinition } from "../../editorial/types";
import type { AppLocale } from "../../lib/i18n";
import { intlLocale } from "../../lib/i18n";
import { LandingOfficePreview } from "../LandingOfficePreview";
import { LandingFooter } from "../LandingSections";
import { EditorialCard } from "./EditorialCard";

type EditorialArticlePageProps = Readonly<{
  locale: AppLocale;
  definition: EditorialDefinition;
}>;

function dateLabel(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function EditorialArticlePage({
  locale,
  definition,
}: EditorialArticlePageProps) {
  const content = editorialContent[locale];
  const copy = content.entries[definition.slug];
  const isBlog = definition.kind === "blog";
  const backLabel = isBlog ? content.ui.backToBlog : content.ui.backToGlossary;
  const related = definition.related
    .map((slug) => editorialDefinition(slug))
    .filter((entry): entry is EditorialDefinition => entry !== undefined);
  const canonicalUrl = `https://stocksembly.com${editorialPath(
    locale,
    definition.kind,
    definition.slug,
  )}`;
  const structuredData = isBlog
    ? {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: copy.title,
        description: copy.description,
        image: `https://stocksembly.com${definition.image}`,
        datePublished: definition.publishedAt,
        dateModified: definition.modifiedAt,
        inLanguage: intlLocale(locale),
        url: canonicalUrl,
        author: { "@type": "Organization", name: "Stocksembly Research" },
        publisher: {
          "@type": "Organization",
          name: "SERN",
          url: "https://stocksembly.com/about",
        },
      }
    : {
        "@context": "https://schema.org",
        "@type": "DefinedTerm",
        name: copy.title,
        description: copy.description,
        inDefinedTermSet: `https://stocksembly.com${editorialPath(locale, "glossary")}`,
        url: canonicalUrl,
        inLanguage: intlLocale(locale),
      };

  return (
    <div className="editorial-page" lang={intlLocale(locale)}>
      <main className="editorial-article-shell">
        <article className="editorial-article">
          <Link
            className="editorial-back-link"
            href={editorialPath(locale, definition.kind)}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {backLabel}
          </Link>
          <header className="editorial-article__header">
            <div className="editorial-article__meta">
              <span>{copy.category}</span>
              <time dateTime={definition.publishedAt}>
                {dateLabel(definition.publishedAt, locale)}
              </time>
              <small>
                <Clock3 size={14} aria-hidden="true" />
                {definition.readingMinutes} {content.ui.minutes}
              </small>
            </div>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </header>
          <div className="editorial-article__image">
            <Image
              src={definition.image}
              alt={copy.imageAlt}
              fill
              priority
              sizes="(max-width: 960px) 100vw, 960px"
            />
          </div>
          <div className="editorial-article__body">
            {copy.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets === undefined ? null : (
                  <ul>
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
            <aside className="editorial-cta">
              <div>
                <h2>{content.ui.ctaTitle}</h2>
                <p>{content.ui.ctaDescription}</p>
              </div>
              <Link
                className="editorial-cta__action"
                href={`/${locale}#product`}
              >
                {content.ui.ctaAction}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </aside>
          </div>
          <LandingOfficePreview locale={locale} />
        </article>
        <section
          className="editorial-related"
          aria-labelledby="editorial-related-title"
        >
          <h2 id="editorial-related-title">{content.ui.readNext}</h2>
          <div className="editorial-grid">
            {related.map((entry) => (
              <EditorialCard
                key={entry.slug}
                locale={locale}
                definition={entry}
                copy={content.entries[entry.slug]}
                action={
                  entry.kind === "blog"
                    ? content.ui.readArticle
                    : content.ui.readDefinition
                }
              />
            ))}
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
