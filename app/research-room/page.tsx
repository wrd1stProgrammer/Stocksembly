import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ResearchRoomCatalog } from "@/src/components/researchRoom/ResearchRoomCatalog";
import { researchRoomUiCopy } from "@/src/components/researchRoom/researchRoomCopy";
import { researchRoomPageHref } from "@/src/components/researchRoom/researchRoomUrls";
import {
  type AppLocale,
  appLocaleFromValue,
  isLocale,
  localeDetails,
  locales,
} from "@/src/lib/i18n";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
import {
  listResearchRoomReportPage,
  RESEARCH_ROOM_PAGE_SIZE,
} from "@/src/research/server/researchRoom/researchRoomCatalog";

export const dynamic = "force-dynamic";

type Props = {
  readonly searchParams: Promise<{
    readonly lang?: string;
    readonly page?: string;
  }>;
};

function archivePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

async function researchRoomLocale(
  value: string | undefined,
  preferStored = false,
): Promise<AppLocale> {
  const stored = (await cookies()).get("stocksembly_locale")?.value;
  if (preferStored && isLocale(stored)) return stored;
  if (isLocale(value)) return value;
  return appLocaleFromValue(stored);
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { lang, page: requestedPage } = await searchParams;
  const locale = await researchRoomLocale(lang);
  const page = archivePage(requestedPage);
  const canonical = researchRoomPageHref(page, locale);
  const languageAlternates = Object.fromEntries([
    ...locales.map((candidate) => [
      localeDetails[candidate].hreflang,
      researchRoomPageHref(page, candidate),
    ]),
    ["x-default", researchRoomPageHref(page, "en")],
  ]);
  const pageTitle = page > 1 ? ` - Page ${page}` : "";
  if (locale === "en") {
    return {
      title: `US Stock AI Research Room${pageTitle}`,
      description:
        "Explore published US stock research by ticker, investment thesis, and specialist team, built from real investor questions.",
      alternates: {
        canonical,
        languages: languageAlternates,
      },
      openGraph: {
        title: "Stocksembly Research Room",
        description:
          "Explore evidence-led US stock research and investment questions reviewed by Stocksembly's AI team.",
        url: canonical,
        type: "website",
        locale: "en_US",
        alternateLocale: "ko_KR",
      },
    };
  }
  if (locale !== "ko") {
    const roomCopy = researchRoomUiCopy[locale];
    return {
      title: `${roomCopy.title}${pageTitle}`,
      description:
        "Explore published US stock research by ticker, investment thesis, and specialist team.",
      alternates: { canonical, languages: languageAlternates },
      openGraph: {
        title: `Stocksembly ${roomCopy.title}`,
        description:
          "Explore evidence-led US stock research reviewed by Stocksembly's AI team.",
        url: canonical,
        type: "website",
        locale: localeDetails[locale].openGraph,
      },
    };
  }
  const koreanPageTitle = page > 1 ? ` - ${page}페이지` : "";
  return {
    title: `미국 주식 AI 리서치룸${koreanPageTitle}`,
    description:
      "실제 투자자 질문으로 생성되고 발행까지 완료된 미국 주식 리서치를 티커, 투자 논지, 분석팀별로 탐색하세요.",
    alternates: {
      canonical,
      languages: languageAlternates,
    },
    openGraph: {
      title: "Stocksembly 리서치룸",
      description:
        "다른 투자자가 검증한 미국 주식 투자 질문과 근거 중심 리포트를 한곳에서 탐색하세요.",
      url: canonical,
      type: "website",
      locale: "ko_KR",
      alternateLocale: "en_US",
    },
  };
}

async function requestFromPage() {
  const [incomingHeaders, incomingCookies] = await Promise.all([
    headers(),
    cookies(),
  ]);
  const host = incomingHeaders.get("host") ?? "localhost:3000";
  return new Request(`http://${host}/research-room`, {
    headers: {
      host,
      cookie: incomingCookies.toString(),
      "sec-fetch-site": "same-origin",
    },
  });
}

export default async function ResearchRoomPage({ searchParams }: Props) {
  const query = await searchParams;
  const page = archivePage(query.page);
  const api = await getLiveResearchApi();
  const request = await requestFromPage();
  const storedLocale = (await cookies()).get("stocksembly_locale")?.value;
  const [access, preference] = await Promise.all([
    api.researchRoomAccess(request),
    api.preferredLocale(request),
  ]);
  const locale = isLocale(query.lang)
    ? query.lang
    : access.authenticated && isLocale(storedLocale)
      ? storedLocale
      : preference.authenticated && preference.locale !== undefined
        ? preference.locale
        : await researchRoomLocale(undefined, access.authenticated);
  if (access.authenticated && query.lang !== locale)
    redirect(researchRoomPageHref(page, locale));
  const reportPage = await listResearchRoomReportPage(access, {
    limit: RESEARCH_ROOM_PAGE_SIZE,
    locale,
    ...(page > 1 ? { offset: (page - 1) * RESEARCH_ROOM_PAGE_SIZE } : {}),
    sort: "latest",
  });
  if (page > 1 && reportPage.reports.length === 0) notFound();
  const archiveUrl = researchRoomPageHref(page, locale);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name:
      locale === "ko" ? "Stocksembly 리서치룸" : "Stocksembly Research Room",
    description:
      locale === "ko"
        ? "발행 완료된 미국 주식 AI 팀 리서치 컬렉션"
        : "A collection of published US equity team research",
    url: `https://stocksembly.com${archiveUrl}`,
    numberOfItems: reportPage.total,
  };
  return (
    <div className="research-room-page" lang={locale}>
      <ResearchRoomCatalog
        key={`${locale}:${page}`}
        access={access}
        initialCompanies={reportPage.companies}
        initialReports={reportPage.reports}
        initialPage={page}
        initialTotal={reportPage.total}
        locale={locale}
      />
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </div>
  );
}
