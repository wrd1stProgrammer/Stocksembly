import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UsStockAnalysisLanding } from "@/src/components/seo/UsStockAnalysisLanding";
import type { AppLocale } from "@/src/lib/i18n";
import { isLocale } from "@/src/lib/i18n";
import { usStockAnalysisMetadata } from "@/src/lib/seo/usStockAnalysisMetadata";

type Props = Readonly<{ params: Promise<{ readonly locale: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? usStockAnalysisMetadata(locale) : {};
}

export default async function LocalizedUsStockAnalysisPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <UsStockAnalysisLanding locale={locale satisfies AppLocale} />;
}
