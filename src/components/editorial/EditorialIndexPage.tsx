import { editorialEntries, editorialPath } from "../../editorial/catalog";
import { editorialContent } from "../../editorial/content";
import type { EditorialKind } from "../../editorial/types";
import type { AppLocale } from "../../lib/i18n";
import { intlLocale } from "../../lib/i18n";
import { LandingFooter } from "../LandingSections";
import { EditorialCard } from "./EditorialCard";

type EditorialIndexPageProps = Readonly<{
  locale: AppLocale;
  kind: EditorialKind;
}>;

export function EditorialIndexPage({ locale, kind }: EditorialIndexPageProps) {
  const content = editorialContent[locale];
  const entries = editorialEntries(kind);
  const isBlog = kind === "blog";
  const title = isBlog ? content.ui.blogTitle : content.ui.glossaryTitle;
  const description = isBlog
    ? content.ui.blogDescription
    : content.ui.glossaryDescription;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: `https://stocksembly.com${editorialPath(locale, kind)}`,
    inLanguage: intlLocale(locale),
    isPartOf: {
      "@type": "WebSite",
      name: "Stocksembly",
      url: "https://stocksembly.com",
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: entries.length,
      itemListElement: entries.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: content.entries[entry.slug].title,
        url: `https://stocksembly.com${editorialPath(locale, kind, entry.slug)}`,
      })),
    },
  };

  return (
    <div className="editorial-page" lang={intlLocale(locale)}>
      <main className="editorial-index">
        <header className="editorial-index__hero">
          <p>{isBlog ? content.ui.blogEyebrow : content.ui.glossaryEyebrow}</p>
          <h1>{title}</h1>
          <span>{description}</span>
        </header>
        <section className="editorial-grid" aria-label={title}>
          {entries.map((entry, index) => (
            <EditorialCard
              key={entry.slug}
              locale={locale}
              definition={entry}
              copy={content.entries[entry.slug]}
              action={
                isBlog ? content.ui.readArticle : content.ui.readDefinition
              }
              priority={index < 3}
            />
          ))}
        </section>
      </main>
      <LandingFooter locale={locale} />
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </div>
  );
}
