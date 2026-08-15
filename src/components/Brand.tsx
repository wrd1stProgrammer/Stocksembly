import Image from "next/image";
import Link from "next/link";
import type { AppLocale } from "../lib/i18n";
import { copy } from "../lib/i18n";

type BrandProps = {
  readonly locale: AppLocale;
};

export function Brand({ locale }: BrandProps) {
  return (
    <Link className="brand" href="/" aria-label={copy[locale].a11y.home}>
      <Image
        className="brand__mark"
        src="/brand/stocksembly-mark-v2.png"
        alt=""
        aria-hidden="true"
        width={32}
        height={32}
        priority
      />
      <span>Stocksembly</span>
    </Link>
  );
}
