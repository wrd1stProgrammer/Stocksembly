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
  AdminPaymentStatus,
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
  title: "결제 · 관리자",
  robots: { index: false, follow: false },
};
type Props = { readonly searchParams: Promise<PageSearchParams> };

export default async function Admin2BillingPage({ searchParams }: Props) {
  const params = pageUrlSearchParams(await searchParams);
  let query: AdminAnalyticsQuery;
  try {
    query = parseAdminAnalyticsQuery(params);
  } catch {
    redirect("/admin2/billing?range=30");
  }
  const result = await (await getLiveResearchApi()).adminAnalyticsOverview(
    await adminPageRequest("/admin2/billing", params),
    query,
  );
  if (result.kind === "unauthenticated")
    redirect(
      `/login?next=${encodeURIComponent(`/admin2/billing${params.size > 0 ? `?${params}` : ""}`)}`,
    );
  if (
    result.kind === "forbidden" ||
    result.kind === "disabled" ||
    result.kind === "not_found"
  )
    notFound();
  if (result.kind === "unavailable")
    return (
      <AdminShell active="billing">
        <section className="admin-panel">
          <h1>데이터를 불러오지 못했습니다.</h1>
        </section>
      </AdminShell>
    );
  return (
    <AdminShell active="billing">
      <AdminPageHeading
        eyebrow="BILLING"
        title="결제"
        generatedAt={result.data.generatedAt}
      >
        <AdminFilters
          query={result.data.query}
          action="/admin2/billing"
          showPlanStatus
        />
      </AdminPageHeading>
      <AdminDataStatus status={result.data.status} />
      <section className="admin-panel admin-trends">
        <header className="admin-panel__header">
          <div>
            <p>일별 흐름</p>
            <h2>결제 성공 추이</h2>
          </div>
        </header>
        <AdminTrendChart
          points={result.data.trends}
          title="결제 성공 추이"
          series={[
            { key: "payments", label: "결제", className: "is-payments" },
          ]}
        />
      </section>
      <AdminPaymentStatus payments={result.data.payments} />
      <div className="admin-two-column">
        <AdminBreakdownSection title="현재 플랜" rows={result.data.plans} />
        <AdminBreakdownSection title="현재 상태" rows={result.data.statuses} />
      </div>
      <p className="admin-panel__note">
        결제 이벤트 수치는 기간 필터를 따르며, 현재 플랜·상태 분포는 응답의 기존
        집계 의미를 유지합니다.
      </p>
    </AdminShell>
  );
}
