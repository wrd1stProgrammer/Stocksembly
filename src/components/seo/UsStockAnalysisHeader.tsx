"use client";

import ky, { isTimeoutError } from "ky";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import type { AppLocale } from "../../lib/i18n";
import { US_STOCK_ANALYSIS_PATHS } from "../../lib/seo/usStockAnalysis";
import { Header } from "../Header";
import { PREFERRED_LOCALE_STORAGE_KEY } from "../SignedInSidebar";

async function persistAccountLocale(locale: AppLocale): Promise<void> {
  try {
    await ky.put("/api/account/preferences", {
      json: { locale },
      retry: 0,
      throwHttpErrors: false,
      timeout: 5_000,
    });
  } catch (error) {
    if (error instanceof TypeError || isTimeoutError(error)) return;
    throw error;
  }
}

type SeoLocaleHeaderProps = Readonly<{
  locale: AppLocale;
  paths: Readonly<
    Record<"en" | "ko", string> & Partial<Record<AppLocale, string>>
  >;
}>;

export function SeoLocaleHeader({ locale, paths }: SeoLocaleHeaderProps) {
  const router = useRouter();

  useEffect(() => {
    window.localStorage.setItem(PREFERRED_LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const changeLocale = useCallback(
    (nextLocale: AppLocale) => {
      window.localStorage.setItem(PREFERRED_LOCALE_STORAGE_KEY, nextLocale);
      document.documentElement.lang = nextLocale;
      void persistAccountLocale(nextLocale);
      router.push(paths[nextLocale] ?? paths.en);
    },
    [paths, router],
  );

  return <Header locale={locale} onLocaleChange={changeLocale} />;
}

type UsStockAnalysisHeaderProps = Readonly<{
  locale: AppLocale;
}>;

export function UsStockAnalysisHeader({ locale }: UsStockAnalysisHeaderProps) {
  return <SeoLocaleHeader locale={locale} paths={US_STOCK_ANALYSIS_PATHS} />;
}
