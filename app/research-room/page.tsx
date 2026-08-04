import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { ResearchRoomCatalog } from "@/src/components/researchRoom/ResearchRoomCatalog";
import type { Locale } from "@/src/lib/i18n";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
import {
  listResearchRoomReportPage,
  RESEARCH_ROOM_PAGE_SIZE,
} from "@/src/research/server/researchRoom/researchRoomCatalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "미국 주식 AI 리서치룸",
  description:
    "실제 투자자 질문으로 생성되고 발행까지 완료된 미국 주식 리서치를 티커, 투자 논지, 분석팀별로 탐색하세요.",
  alternates: { canonical: "/research-room" },
  openGraph: {
    title: "Stocksembly 리서치룸",
    description:
      "다른 투자자가 검증한 미국 주식 투자 질문과 근거 중심 리포트를 한곳에서 탐색하세요.",
    url: "/research-room",
    type: "website",
  },
};

type Props = { readonly searchParams: Promise<{ readonly lang?: string }> };

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
  const locale: Locale = query.lang === "en" ? "en" : "ko";
  const access = await (await getLiveResearchApi()).researchRoomAccess(
    await requestFromPage(),
  );
  const reportPage = await listResearchRoomReportPage(access, {
    limit: RESEARCH_ROOM_PAGE_SIZE,
    sort: "latest",
  });
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name:
      locale === "ko" ? "Stocksembly 리서치룸" : "Stocksembly Research Room",
    description:
      locale === "ko"
        ? "발행 완료된 미국 주식 AI 팀 리서치 컬렉션"
        : "A collection of published US equity team research",
    url: "https://stocksembly.com/research-room",
    numberOfItems: reportPage.total,
  };
  return (
    <div className="research-room-page" lang={locale}>
      <ResearchRoomCatalog
        access={access}
        initialCompanies={reportPage.companies}
        initialReports={reportPage.reports}
        initialTotal={reportPage.total}
        locale={locale}
      />
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </div>
  );
}
