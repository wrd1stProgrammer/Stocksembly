import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";

type LanguageToggleProps = {
  readonly locale: Locale;
  readonly onChange: (locale: Locale) => void;
};

export function LanguageToggle({ locale, onChange }: LanguageToggleProps) {
  return (
    <fieldset className="language-toggle">
      <legend className="sr-only">{copy[locale].a11y.language}</legend>
      <button
        type="button"
        aria-pressed={locale === "en"}
        onClick={() => onChange("en")}
      >
        EN
      </button>
      <span aria-hidden="true" />
      <button
        type="button"
        aria-pressed={locale === "ko"}
        onClick={() => onChange("ko")}
      >
        한국어
      </button>
    </fieldset>
  );
}
