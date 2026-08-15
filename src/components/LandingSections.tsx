import Link from "next/link";
import type { AppLocale } from "../lib/i18n";
import { copy, localeDetails, locales } from "../lib/i18n";
import { Brand } from "./Brand";

type LandingSectionsProps = {
  readonly locale: AppLocale;
};

export function LandingSections(_props: LandingSectionsProps) {
  return null;
}

export function LandingFooter({ locale }: LandingSectionsProps) {
  const content = copy[locale].footer;
  const informationLinks = [
    { href: "/about", label: content.about },
    { href: "/methodology", label: content.methodology },
    { href: "/editorial-policy", label: content.editorialPolicy },
    { href: "/corrections", label: content.corrections },
  ] as const;
  const legalLinks = [
    { href: "/terms", label: content.terms },
    { href: "/privacy", label: content.privacy },
    { href: "/disclaimer", label: content.disclaimerLabel },
    { href: "/risk-disclosure", label: content.risk },
  ] as const;

  return (
    <footer className="site-footer">
      <div className="site-footer__primary">
        <div className="site-footer__brand">
          <Brand locale={locale} />
          <p>{content.purpose}</p>
          <span>{content.operator}</span>
        </div>
        <nav
          className="site-footer__column"
          aria-label={content.productHeading}
        >
          <strong>{content.productHeading}</strong>
          <Link href={`/${locale}/us-stock-analysis`}>
            {content.stockAnalysis}
          </Link>
          <a href="#product">{content.howItWorks}</a>
          <a href="#product">{content.research}</a>
        </nav>
        <nav
          className="site-footer__column"
          aria-label={content.standardsHeading}
        >
          <strong>{content.standardsHeading}</strong>
          {informationLinks.map((link) => (
            <Link key={link.href} href={`${link.href}?lang=${locale}`}>
              {link.label}
            </Link>
          ))}
        </nav>
        <address className="site-footer__column">
          <strong>{content.contactHeading}</strong>
          <a href="mailto:kicoa24@gmail.com">{content.support}</a>
          <span>kicoa24@gmail.com</span>
          <span>Room 306, 32-4, Banryong-ro 18beon-gil, South Korea</span>
        </address>
        <nav className="site-footer__column" aria-label={content.legalHeading}>
          <strong>{content.legalHeading}</strong>
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="site-footer__meta">
        <span>© 2026 {content.rights}</span>
        <nav aria-label={content.legalHeading}>
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="site-footer__locale">
          {localeDetails[locale].nativeLabel} · {locales.length} languages
        </span>
      </div>
      <p className="site-footer__disclaimer">{content.disclaimer}</p>
    </footer>
  );
}
