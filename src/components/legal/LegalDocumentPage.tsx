import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { LegalDocument } from "../../lib/legal/legalDocument";
import { Brand } from "../Brand";

type LegalDocumentPageProps = {
  readonly document: LegalDocument;
};

export function LegalDocumentPage({ document }: LegalDocumentPageProps) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Brand locale="en" />
        <Link className="legal-header__back" href="/">
          <ArrowLeft aria-hidden="true" size={16} />
          Back to home
        </Link>
      </header>

      <main className="legal-document">
        <div className="legal-document__intro">
          <p className="legal-document__eyebrow">Legal</p>
          <h1>{document.title}</h1>
          <p className="legal-document__description">{document.description}</p>
          <p className="legal-document__updated">
            Last updated <time dateTime="2026-07-22">{document.updated}</time>
          </p>
        </div>

        <aside className="legal-document__notice" aria-label="Draft notice">
          <strong>Review status</strong>
          <p>{document.notice}</p>
        </aside>

        <div className="legal-document__sections">
          {document.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets && (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>

      <footer className="legal-page__footer">
        <span>© 2026 SERN. All rights reserved.</span>
        <a href="mailto:kicoa24@gmail.com">kicoa24@gmail.com</a>
      </footer>
    </div>
  );
}
