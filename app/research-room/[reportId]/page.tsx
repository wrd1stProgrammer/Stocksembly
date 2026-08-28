import { LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { CreditShortageModal } from "@/src/components/billing/CreditShortageModal";
import { MembershipAccessModal } from "@/src/components/billing/MembershipAccessModal";
import { PublishedResearchWorkspace } from "@/src/components/researchRoom/PublishedResearchWorkspace";
import { researchRoomUiCopy } from "@/src/components/researchRoom/researchRoomCopy";
import {
  type AppLocale,
  appLocaleFromValue,
  isLocale,
  localeDetails,
  researchLocale,
} from "@/src/lib/i18n";
import {
  boundedSeoDescription,
  brandedSeoTitle,
} from "@/src/lib/seo/metadataText";
import { researchReportSeoTitle } from "@/src/lib/seo/researchReportMetadata";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
import {
  loadResearchRoomReport,
  recordResearchRoomView,
} from "@/src/research/server/researchRoom/researchRoomCatalog";
import { requiresResearchRoomViewCredit } from "@/src/research/server/researchRoom/researchRoomIndexability";

export const dynamic = "force-dynamic";

type Props = {
  readonly params: Promise<{ readonly reportId: string }>;
  readonly searchParams: Promise<{ readonly lang?: string }>;
};

async function researchRoomLocale(
  value: string | undefined,
  preferStored = false,
): Promise<AppLocale> {
  const stored = (await cookies()).get("stocksembly_locale")?.value;
  if (preferStored && isLocale(stored)) return stored;
  if (isLocale(value)) return value;
  return appLocaleFromValue(stored);
}

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

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ reportId }, query] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(reportId).success)
    return {
      title: "Research Room",
      robots: { index: false, follow: false },
    };
  const locale = await researchRoomLocale(query.lang);
  const contentLocale = researchLocale(locale);
  const access = { authenticated: false, tier: "free" as const };
  const report = await loadResearchRoomReport(
    reportId,
    access,
    new Date(),
    locale,
  ).catch(() => undefined);
  if (report === undefined || report === "locked")
    return { title: "Research Room", robots: { index: false, follow: false } };
  const reportPath = `/research-room/${reportId}`;
  const localizedReportPath =
    locale === "ko"
      ? reportPath
      : `${reportPath}?lang=${encodeURIComponent(locale)}`;
  const seoTitle = brandedSeoTitle(
    researchReportSeoTitle(
      report.item.symbol,
      report.item.question,
      contentLocale,
    ),
  );
  const seoDescription = boundedSeoDescription(
    report.file.thesis[contentLocale],
  );
  return {
    title: { absolute: seoTitle },
    description: seoDescription,
    robots: { index: true, follow: true },
    alternates: {
      canonical: localizedReportPath,
      languages: {
        ko: reportPath,
        en: `${reportPath}?lang=en`,
        "x-default": reportPath,
      },
    },
    openGraph: {
      title: seoTitle,
      description: seoDescription,
      locale: localeDetails[locale].openGraph,
      alternateLocale:
        locale === "ko"
          ? "en_US"
          : locale === "en"
            ? "ko_KR"
            : ["en_US", "ko_KR"],
      url: localizedReportPath,
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
  const api = await getLiveResearchApi();
  const request = await pageRequest(reportId);
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
    redirect(`/research-room/${reportId}?lang=${encodeURIComponent(locale)}`);
  const roomCopy = researchRoomUiCopy[locale];
  const contentLocale = researchLocale(locale);
  const now = new Date();
  const report = await loadResearchRoomReport(reportId, access, now, locale);
  if (report === undefined) notFound();
  if (report === "locked") {
    return (
      <main className="research-room-locked" lang={locale}>
        <MembershipAccessModal
          locale={contentLocale}
          open
          reason="recent-report"
        />
        <LockKeyhole size={34} />
        <span>MEMBER EDITION</span>
        <h1>{roomCopy.lockedTitle}</h1>
        <p>{roomCopy.lockedBody}</p>
        <div>
          <Link href={`/research-room?lang=${locale}`}>{roomCopy.back}</Link>
          <Link href={`/login?lang=${locale}`}>{roomCopy.signIn}</Link>
        </div>
      </main>
    );
  }
  const credit = requiresResearchRoomViewCredit(report.item.publishedAt, now)
    ? await api.consumeResearchRoomCredit(request, reportId)
    : undefined;
  if (credit?.authenticated && !credit.allowed) {
    return (
      <main className="research-room-locked" lang={locale}>
        <CreditShortageModal
          locale={contentLocale}
          open
          remaining={credit.remaining}
          required={credit.required}
        />
        <span>CREDIT LIMIT</span>
        <h1>{roomCopy.creditTitle}</h1>
        <p>{roomCopy.creditBody}</p>
        <Link href={`/research-room?lang=${locale}`}>{roomCopy.back}</Link>
      </main>
    );
  }
  await recordResearchRoomView(reportId).catch(() => undefined);
  const seoTitle = researchReportSeoTitle(
    report.item.symbol,
    report.item.question,
    contentLocale,
  );
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Report",
    name: seoTitle,
    datePublished: report.item.publishedAt,
    about: { "@type": "Corporation", tickerSymbol: report.item.symbol },
    publisher: { "@type": "Organization", name: "Stocksembly" },
    description: report.file.thesis[contentLocale],
    inLanguage: report.item.locale,
    url: `https://stocksembly.com/research-room/${reportId}?lang=${encodeURIComponent(locale)}`,
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
        sourceLocale={report.item.locale}
        version={report.version}
      />
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </>
  );
}
