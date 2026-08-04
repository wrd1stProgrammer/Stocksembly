import { LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CreditShortageModal } from "@/src/components/billing/CreditShortageModal";
import { PublishedResearchWorkspace } from "@/src/components/researchRoom/PublishedResearchWorkspace";
import type { Locale } from "@/src/lib/i18n";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
import {
  loadResearchRoomReport,
  recordResearchRoomView,
} from "@/src/research/server/researchRoom/researchRoomCatalog";

export const dynamic = "force-dynamic";

type Props = {
  readonly params: Promise<{ readonly reportId: string }>;
  readonly searchParams: Promise<{ readonly lang?: string }>;
};

async function pageRequest(reportId: string) {
  const [incomingHeaders, incomingCookies] = await Promise.all([
    headers(),
    cookies(),
  ]);
  const host = incomingHeaders.get("host") ?? "localhost:3000";
  return new Request(`http://${host}/research-room/${reportId}`, {
    headers: {
      host,
      cookie: incomingCookies.toString(),
      "sec-fetch-site": "same-origin",
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { reportId } = await params;
  if (!z.string().uuid().safeParse(reportId).success)
    return { title: "Research Room" };
  const access = { authenticated: false, tier: "free" as const };
  const report = await loadResearchRoomReport(reportId, access).catch(
    () => undefined,
  );
  if (report === undefined || report === "locked")
    return { title: "Research Room", robots: { index: false, follow: false } };
  return {
    title: `${report.item.symbol} · ${report.item.question}`,
    description: report.file.thesis.ko,
    alternates: { canonical: `/research-room/${reportId}` },
    openGraph: {
      title: `${report.item.symbol} 리서치 · Stocksembly`,
      description: report.file.thesis.ko,
      url: `/research-room/${reportId}`,
      type: "article",
      publishedTime: report.item.publishedAt,
    },
  };
}

export default async function ResearchRoomReportPage({
  params,
  searchParams,
}: Props) {
  const [{ reportId }, query] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(reportId).success) notFound();
  const locale: Locale = query.lang === "en" ? "en" : "ko";
  const api = await getLiveResearchApi();
  const request = await pageRequest(reportId);
  const access = await api.researchRoomAccess(request);
  const report = await loadResearchRoomReport(reportId, access);
  if (report === undefined) notFound();
  if (report === "locked") {
    return (
      <main className="research-room-locked" lang={locale}>
        <LockKeyhole size={34} />
        <span>MEMBER EDITION</span>
        <h1>
          {locale === "ko"
            ? "최신 리서치는 유료 멤버에게 먼저 공개됩니다."
            : "Latest research opens to paid members first."}
        </h1>
        <p>
          {locale === "ko"
            ? "무료 계정은 발행 7일 후 같은 리포트를 전체 열람할 수 있습니다."
            : "Free accounts can read the full report seven days after publication."}
        </p>
        <div>
          <Link href={`/research-room?lang=${locale}`}>
            {locale === "ko"
              ? "리서치룸으로 돌아가기"
              : "Back to Research Room"}
          </Link>
          <Link href="/login">{locale === "ko" ? "로그인" : "Sign in"}</Link>
        </div>
      </main>
    );
  }
  const credit = await api.consumeResearchRoomCredit(request, reportId);
  if (credit.authenticated && !credit.allowed) {
    return (
      <main className="research-room-locked" lang={locale}>
        <CreditShortageModal locale={locale} open />
        <span>CREDIT LIMIT</span>
        <h1>
          {locale === "ko"
            ? "크레딧이 부족해 리서치룸을 열 수 없습니다."
            : "This Research Room needs more credits."}
        </h1>
        <p>
          {locale === "ko"
            ? "플랜을 확인하거나 다음 크레딧 지급을 기다려 주세요."
            : "Review your plan or wait for the next credit grant."}
        </p>
        <Link href={`/research-room?lang=${locale}`}>
          {locale === "ko" ? "리서치룸으로 돌아가기" : "Back to Research Room"}
        </Link>
      </main>
    );
  }
  await recordResearchRoomView(reportId).catch(() => undefined);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Report",
    name: `${report.item.symbol} · ${report.item.question}`,
    datePublished: report.item.publishedAt,
    about: { "@type": "Corporation", tickerSymbol: report.item.symbol },
    publisher: { "@type": "Organization", name: "Stocksembly" },
    description: report.file.thesis[locale],
  };
  return (
    <>
      <PublishedResearchWorkspace
        accessAuthenticated={access.authenticated}
        company={report.company}
        conversation={report.conversation}
        file={report.file}
        locale={locale}
        originalQuestion={report.item.question}
        reportId={report.item.reportId}
        runDetail={report.runDetail}
        version={report.version}
      />
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </>
  );
}
