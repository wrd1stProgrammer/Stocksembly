"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "../lib/i18n";
import { copy, localeDetails, locales } from "../lib/i18n";
import { HeaderAuthAction } from "./auth/HeaderAuthAction";
import { Brand } from "./Brand";

type HeaderProps = {
  readonly locale: AppLocale;
  readonly onLocaleChange: (locale: AppLocale) => void;
};

export function Header({ locale, onLocaleChange }: HeaderProps) {
  const labels = copy[locale].nav;
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!languageOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!languageRef.current?.contains(event.target as Node))
        setLanguageOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLanguageOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [languageOpen]);

  function selectLocale(nextLocale: AppLocale) {
    onLocaleChange(nextLocale);
    setLanguageOpen(false);
  }

  return (
    <header className="site-header">
      <Brand locale={locale} />
      <div className="site-header__actions">
        <div className="header-language-slot" ref={languageRef}>
          <button
            type="button"
            className="header-language-slot__trigger"
            aria-expanded={languageOpen}
            aria-haspopup="listbox"
            aria-label={copy[locale].a11y.language}
            onClick={() => setLanguageOpen((open) => !open)}
          >
            <span>{localeDetails[locale].nativeLabel}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {languageOpen ? (
            <div
              className="header-language-slot__menu"
              role="listbox"
              aria-label={copy[locale].a11y.language}
            >
              {locales.map((value) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={locale === value}
                  className={locale === value ? "is-selected" : undefined}
                  key={value}
                  onClick={() => selectLocale(value)}
                >
                  <span>
                    <strong>{localeDetails[value].nativeLabel}</strong>
                    <small>{localeDetails[value].label}</small>
                  </span>
                  {locale === value ? (
                    <Check size={15} aria-hidden="true" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <HeaderAuthAction label={labels.getStarted} locale={locale} />
      </div>
    </header>
  );
}
