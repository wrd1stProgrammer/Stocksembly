import "../styles/landing.css";
import Link from "next/link";
import type { AppLocale } from "../lib/i18n";
import { copy, localeDetails, locales } from "../lib/i18n";
import { Brand } from "./Brand";

type LandingSectionsProps = {
  readonly locale: AppLocale;
};

export function LandingSections({ locale }: LandingSectionsProps) {
  const content = copy[locale].landing.explainer;
  const steps = copy[locale].landing.steps;
  return (
    <>
      <section className="landing-steps" aria-labelledby="landing-steps-title">
        <p className="landing-steps__eyebrow">{steps.eyebrow}</p>
        <h2 id="landing-steps-title">{steps.title}</h2>
        <ol className="landing-steps__items">
          {steps.items.map((item, index) => (
            <li key={item.title}>
              <span className="landing-steps__number" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section
        className="landing-explainer"
        aria-labelledby="landing-explainer-title"
      >
        <p className="landing-explainer__eyebrow">{content.eyebrow}</p>
        <h2 id="landing-explainer-title">{content.title}</h2>
        <ul className="landing-explainer__cards">
          {content.cards.map((card) => (
            <li key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function LandingFooter({
  locale,
  localePathSuffix = "",
}: LandingSectionsProps & { readonly localePathSuffix?: string }) {
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
          <h2>{content.productHeading}</h2>
          <Link href={`/${locale}/us-stock-analysis`}>
            {content.stockAnalysis}
          </Link>
          <Link href={locale === "en" ? "/pricing?lang=en" : "/pricing"}>
            {content.pricing}
          </Link>
          <a href="#product">{content.howItWorks}</a>
          <a href="#product">{content.research}</a>
        </nav>
        <nav
          className="site-footer__column"
          aria-label={content.standardsHeading}
        >
          <h2>{content.standardsHeading}</h2>
          {informationLinks.map((link) => (
            <Link
              key={link.href}
              href={locale === "en" ? `${link.href}?lang=en` : link.href}
            >
              {link.label}
            </Link>
          ))}
          <Link href={`/${locale}/blog`}>{content.blog}</Link>
          <Link href={`/${locale}/glossary`}>{content.glossary}</Link>
        </nav>
        <address className="site-footer__column">
          <h2>{content.contactHeading}</h2>
          <Link href={locale === "en" ? "/contact?lang=en" : "/contact"}>
            {content.support}
          </Link>
          <span>kicoa24@gmail.com</span>
          <span>Room 306, 32-4, Banryong-ro 18beon-gil, South Korea</span>
        </address>
        <nav className="site-footer__column" aria-label={content.legalHeading}>
          <h2>{content.legalHeading}</h2>
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
        <nav
          className="site-footer__locale"
          aria-label={copy[locale].a11y.language}
        >
          {locales.map((value) => (
            <Link
              key={value}
              href={`/${value}${localePathSuffix}`}
              hrefLang={localeDetails[value].hreflang}
              aria-current={value === locale ? "page" : undefined}
            >
              {localeDetails[value].nativeLabel}
            </Link>
          ))}
        </nav>
      </div>
      <p className="site-footer__disclaimer">{content.disclaimer}</p>
    </footer>
  );
}
