import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  type AdminAnalyticsQuery,
  parseAdminAnalyticsQuery,
} from "@/src/admin/analyticsContracts";
import {
  adminPageRequest,
  type PageSearchParams,
  pageUrlSearchParams,
} from "@/src/admin/server/adminPageRequest";
import {
  AdminDataStatus,
  AdminKpiCards,
} from "@/src/components/admin/AdminAnalyticsSections";
import { AdminFilters } from "@/src/components/admin/AdminFilters";
import {
  AdminPageHeading,
  AdminShell,
} from "@/src/components/admin/AdminShell";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "요약 · 관리자",
  robots: { index: false, follow: false },
};
type Props = { readonly searchParams: Promise<PageSearchParams> };

export default async function Admin2Page({ searchParams }: Props) {
  const params = pageUrlSearchParams(await searchParams);
  let query: AdminAnalyticsQuery;
  try {
    query = parseAdminAnalyticsQuery(params);
  } catch {
    redirect("/admin2?range=30");
  }
  const result = await (await getLiveResearchApi()).adminAnalyticsOverview(
    await adminPageRequest("/admin2", params),
    query,
  );
  if (result.kind === "unauthenticated")
    redirect(
      `/login?next=${encodeURIComponent(`/admin2${params.size > 0 ? `?${params}` : ""}`)}`,
    );
  if (
    result.kind === "forbidden" ||
    result.kind === "disabled" ||
    result.kind === "not_found"
  )
    notFound();
  if (result.kind === "unavailable")
    return (
      <AdminShell active="overview">
        <section className="admin-panel">
          <h1>데이터를 불러오지 못했습니다.</h1>
          <p className="admin-panel__note">
            데이터베이스 연결과 관리자 분석 마이그레이션 상태를 확인해주세요.
          </p>
        </section>
      </AdminShell>
    );
  const detailQuery = `?${params.toString()}`;
  return (
    <AdminShell active="overview">
      <AdminPageHeading
        eyebrow="ADMIN ANALYTICS"
        title="서비스 요약"
        generatedAt={result.data.generatedAt}
      >
        <AdminFilters
          query={result.data.query}
          action="/admin2"
          showAcquisition={false}
          showLocale={false}
        />
      </AdminPageHeading>
      <AdminDataStatus status={result.data.status} />
      <AdminKpiCards
        data={result.data}
        summary
        links={{
          acquisition: `/admin2/acquisition${detailQuery}`,
          behavior: `/admin2/behavior${detailQuery}`,
          billing: `/admin2/billing${detailQuery}`,
        }}
      />
    </AdminShell>
  );
}
