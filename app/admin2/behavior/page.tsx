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
  AdminEngagementTable,
  AdminRetentionSection,
  AdminUsageTable,
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
  title: "사용자 행동 · 관리자",
  robots: { index: false, follow: false },
};
type Props = { readonly searchParams: Promise<PageSearchParams> };

export default async function Admin2BehaviorPage({ searchParams }: Props) {
  const params = pageUrlSearchParams(await searchParams);
  let query: AdminAnalyticsQuery;
  try {
    query = parseAdminAnalyticsQuery(params);
  } catch {
    redirect("/admin2/behavior?range=30");
  }
  const result = await (await getLiveResearchApi()).adminAnalyticsOverview(
    await adminPageRequest("/admin2/behavior", params),
    query,
  );
  if (result.kind === "unauthenticated")
    redirect(
      `/login?next=${encodeURIComponent(`/admin2/behavior${params.size > 0 ? `?${params}` : ""}`)}`,
    );
  if (
    result.kind === "forbidden" ||
    result.kind === "disabled" ||
    result.kind === "not_found"
  )
    notFound();
  if (result.kind === "unavailable")
    return (
      <AdminShell active="behavior">
        <section className="admin-panel">
          <h1>데이터를 불러오지 못했습니다.</h1>
        </section>
      </AdminShell>
    );
  return (
    <AdminShell active="behavior">
      <AdminPageHeading
        eyebrow="USER BEHAVIOR"
        title="사용자 행동"
        generatedAt={result.data.generatedAt}
      >
        <AdminFilters
          query={result.data.query}
          action="/admin2/behavior"
          showAcquisition={false}
          showLocale={false}
        />
      </AdminPageHeading>
      <AdminDataStatus status={result.data.status} />
      <section className="admin-panel admin-trends">
        <header className="admin-panel__header">
          <div>
            <p>일별 흐름</p>
            <h2>활성 사용자·핵심 액션 추이</h2>
          </div>
        </header>
        <AdminTrendChart
          points={result.data.trends}
          title="활성 사용자·핵심 액션 추이"
          series={[
            {
              key: "activeUsers",
              label: "활성 사용자",
              className: "is-active",
            },
            { key: "actions", label: "핵심 액션", className: "is-actions" },
          ]}
        />
      </section>
      <div className="admin-two-column">
        <AdminRetentionSection rows={result.data.retention} />
        <AdminUsageTable rows={result.data.usage} />
      </div>
      <AdminEngagementTable rows={result.data.engagement} periodOnlyNote />
    </AdminShell>
  );
}
