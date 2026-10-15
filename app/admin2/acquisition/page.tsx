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
  AdminBreakdownSection,
  AdminDataStatus,
  AdminFunnel,
} from "@/src/components/admin/AdminAnalyticsSections";
import { AdminFilters } from "@/src/components/admin/AdminFilters";
import {
  AdminPageHeading,
  AdminShell,
} from "@/src/components/admin/AdminShell";
import { AdminTrendChart } from "@/src/components/admin/AdminTrendChart";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "유입·전환 · 관리자",
  robots: { index: false, follow: false },
};
type Props = { readonly searchParams: Promise<PageSearchParams> };

export default async function Admin2AcquisitionPage({ searchParams }: Props) {
  const params = pageUrlSearchParams(await searchParams);
  let query: AdminAnalyticsQuery;
  try {
    query = parseAdminAnalyticsQuery(params);
  } catch {
    redirect("/admin2/acquisition?range=30");
  }
  const result = await (await getLiveResearchApi()).adminAnalyticsOverview(
    await adminPageRequest("/admin2/acquisition", params),
    query,
  );
  if (result.kind === "unauthenticated")
    redirect(
      `/login?next=${encodeURIComponent(`/admin2/acquisition${params.size > 0 ? `?${params}` : ""}`)}`,
    );
  if (
    result.kind === "forbidden" ||
    result.kind === "disabled" ||
    result.kind === "not_found"
  )
    notFound();
  if (result.kind === "unavailable")
    return (
      <AdminShell active="acquisition">
        <section className="admin-panel">
          <h1>데이터를 불러오지 못했습니다.</h1>
        </section>
      </AdminShell>
    );
  return (
    <AdminShell active="acquisition">
      <AdminPageHeading
        eyebrow="ACQUISITION"
        title="유입·전환"
        generatedAt={result.data.generatedAt}
      >
        <AdminFilters query={result.data.query} action="/admin2/acquisition" />
      </AdminPageHeading>
      <AdminDataStatus status={result.data.status} />
      <section className="admin-panel admin-trends">
        <header className="admin-panel__header">
          <div>
            <p>일별 흐름</p>
            <h2>가입 추이</h2>
          </div>
        </header>
        <AdminTrendChart
          points={result.data.trends}
          title="가입 추이"
          series={[{ key: "signups", label: "가입", className: "is-signups" }]}
        />
      </section>
      <div className="admin-two-column">
        <AdminFunnel
          title="가입 → 활성화 → 결제"
          funnel={result.data.signupFunnel}
          activation
        />
        <AdminFunnel
          title="결제 이동 준비 완료 → 결제"
          funnel={result.data.checkoutFunnel}
        />
      </div>
      <div className="admin-two-column">
        <AdminBreakdownSection
          title="가입 설문 유입 경로"
          rows={result.data.onboardingDiscoverySources}
        />
        <AdminBreakdownSection
          title="자동 감지 유입 채널"
          rows={result.data.acquisition}
        />
      </div>
      <div className="admin-two-column">
        <AdminBreakdownSection
          title="UTM 소스"
          rows={result.data.acquisitionSources}
        />
        <AdminBreakdownSection
          title="UTM 캠페인"
          rows={result.data.acquisitionCampaigns}
        />
      </div>
    </AdminShell>
  );
}
