import "../../styles/public-information.css";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { Locale } from "../../lib/i18n";
import type { PublicInformationDocument } from "../../lib/publicInformation/contracts";
import { publicInformationDocuments } from "../../lib/publicInformation/documents";
import { publicInformationHref } from "../../lib/publicInformation/routes";
import { publicInformationUi } from "../../lib/publicInformation/ui";
import { Brand } from "../Brand";

type PublicInformationPageProps = Readonly<{
  document: PublicInformationDocument;
  locale: Locale;
}>;

export function PublicInformationPage({
  document,
  locale,
}: PublicInformationPageProps) {
  const ui = publicInformationUi[locale];
  const structuredData = {
    "@context": "https://schema.org",
    "@type": document.schemaType,
    name: document.title[locale],
    description: document.description[locale],
    url: `https://stocksembly.com${publicInformationHref(document, locale)}`,
    dateModified: document.updated,
    inLanguage: locale === "ko" ? "ko-KR" : "en-US",
    publisher: {
      "@type": "Organization",
      name: "SERN",
      url: "https://stocksembly.com",
    },
  };

  return (
    <div className="information-page" lang={locale}>
      <header className="information-header">
        <Brand locale={locale} />
        <div className="information-header__actions">
          <nav aria-label={ui.chooseLanguage}>
            <Link
              href={document.path}
              hrefLang="ko"
              aria-current={locale === "ko" ? "page" : undefined}
            >
              한국어
            </Link>
            <Link
              href={`${document.path}?lang=en`}
              hrefLang="en"
              aria-current={locale === "en" ? "page" : undefined}
            >
              EN
            </Link>
          </nav>
          <Link
            className="information-header__back"
            href={locale === "en" ? "/?lang=en" : "/"}
          >
            <ArrowLeft aria-hidden="true" size={16} />
            {ui.backHome}
          </Link>
        </div>
      </header>

      <main className="information-layout">
        <article className="information-document">
          <header className="information-document__intro">
            <p className="information-document__eyebrow">
              {document.eyebrow[locale]}
            </p>
            <h1>{document.title[locale]}</h1>
            <p className="information-document__description">
              {document.description[locale]}
            </p>
            <p className="information-document__updated">
              {ui.lastUpdated}{" "}
              <time dateTime={document.updated}>{document.updated}</time>
            </p>
          </header>

          <div className="information-document__sections">
            {document.sections.map((section) => (
              <section id={section.id} key={section.id}>
                <h2>{section.title[locale]}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph.en}>{paragraph[locale]}</p>
                ))}
                {section.bullets === undefined ? null : (
                  <ul>
                    {section.bullets.map((bullet) => (
                      <li key={bullet.en}>{bullet[locale]}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </article>

        <aside className="information-index">
          <strong>{ui.contents}</strong>
          <nav aria-label={ui.contents}>
            {document.sections.map((section) => (
              <a href={`#${section.id}`} key={section.id}>
                {section.title[locale]}
              </a>
            ))}
          </nav>
          <strong>{ui.related}</strong>
          <nav aria-label={ui.related}>
            {Object.values(publicInformationDocuments).map((related) => (
              <Link
                href={publicInformationHref(related, locale)}
                aria-current={related.key === document.key ? "page" : undefined}
                key={related.key}
              >
                {related.title[locale]}
                {related.key === document.key ? null : (
                  <ArrowUpRight aria-hidden="true" size={13} />
                )}
              </Link>
            ))}
          </nav>
        </aside>
      </main>

      <footer className="information-page__footer">
        <span>© 2026 {ui.rights}</span>
        <p>
          <strong>{ui.contact}</strong> {ui.contactDescription}{" "}
          <a href="mailto:kicoa24@gmail.com">kicoa24@gmail.com</a>
        </p>
      </footer>
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </div>
  );
}
