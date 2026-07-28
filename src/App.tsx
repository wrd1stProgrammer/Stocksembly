"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { LandingFooter, LandingSections } from "./components/LandingSections";
import { LandingOfficePreview } from "./components/LandingOfficePreview";
import { PrismRevealText } from "./components/PrismRevealText";
import { SearchConsole } from "./components/SearchConsole";
import type { Locale } from "./lib/i18n";
import { copy } from "./lib/i18n";

export function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const content = copy[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title =
      locale === "en"
        ? "Stocksembly — See the whole company"
        : "Stocksembly — 기업의 전체를 보세요";
  }, [locale]);

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden="true" />
      <Header locale={locale} onLocaleChange={setLocale} />
      <main>
        <section className="hero" id="product">
          <div className="hero__copy">
            <p className="hero__eyebrow">{content.hero.eyebrow}</p>
            <h1>
              <span className="hero__title-lead">{content.hero.titleLead}</span>{" "}
              <PrismRevealText
                key={content.hero.titleTail}
                text={content.hero.titleTail}
              />
            </h1>
            <p className="hero__description">
              <span className="hero__description-lead">
                {content.hero.descriptionLead}
              </span>{" "}
              <span className="hero__description-tail">
                {content.hero.descriptionTail}
              </span>
            </p>
          </div>
          <SearchConsole locale={locale} />
          <LandingOfficePreview locale={locale} />
          <p className="hero__proof">
            <ShieldCheck aria-hidden="true" size={22} />
            {content.hero.proof}
          </p>
        </section>
        <LandingSections locale={locale} />
      </main>
      <LandingFooter locale={locale} />
    </div>
  );
}
