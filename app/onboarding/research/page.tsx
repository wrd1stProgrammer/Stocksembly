import { OnboardingResearchPreview } from "@/src/components/onboarding/OnboardingResearchPreview";
import { isLocale } from "@/src/lib/i18n";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  return <OnboardingResearchPreview locale={isLocale(lang) ? lang : "en"} />;
}
