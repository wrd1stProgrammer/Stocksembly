import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";
import { Brand } from "./Brand";
import { LanguageToggle } from "./LanguageToggle";

type HeaderProps = {
  readonly locale: Locale;
  readonly onLocaleChange: (locale: Locale) => void;
};

export function Header({ locale, onLocaleChange }: HeaderProps) {
  const labels = copy[locale].nav;

  return (
    <header className="site-header">
      <Brand locale={locale} />
      <nav aria-label={copy[locale].a11y.navigation}>
        <a href="#product">{labels.product}</a>
      </nav>
      <div className="site-header__actions">
        <LanguageToggle locale={locale} onChange={onLocaleChange} />
        <a className="sign-in" href="#research">
          {labels.getStarted}
        </a>
      </div>
    </header>
  );
}
