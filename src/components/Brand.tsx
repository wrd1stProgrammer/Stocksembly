import Link from "next/link";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";

type BrandProps = {
  readonly locale: Locale;
};

export function Brand({ locale }: BrandProps) {
  return (
    <Link className="brand" href="/" aria-label={copy[locale].a11y.home}>
      <svg className="brand__mark" aria-hidden="true" viewBox="0 0 32 32">
        <path d="M4 8.5 16 2l12 6.5v15L16 30 4 23.5z" />
        <path d="M16 2v28M4 8.5l24 15M28 8.5 4 23.5" />
      </svg>
      <span>Stocksembly</span>
    </Link>
  );
}
