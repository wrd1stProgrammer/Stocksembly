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
import { AdminUserTable } from "@/src/components/admin/AdminAnalyticsSections";
import { AdminFilters } from "@/src/components/admin/AdminFilters";
import {
  AdminPageHeading,
  AdminShell,
} from "@/src/components/admin/AdminShell";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "사용자 · 관리자",
  robots: { index: false, follow: false },
};
type Props = { readonly searchParams: Promise<PageSearchParams> };

export default async function Admin2UsersPage({ searchParams }: Props) {
  const params = pageUrlSearchParams(await searchParams);
  let query: AdminAnalyticsQuery;
  try {
    query = parseAdminAnalyticsQuery(params);
  } catch {
    redirect("/admin2/users?range=30");
  }
  const result = await (await getLiveResearchApi()).adminAnalyticsUsers(
    await adminPageRequest("/admin2/users", params),
    query,
  );
  if (result.kind === "unauthenticated")
    redirect(
      `/login?next=${encodeURIComponent(`/admin2/users${params.size > 0 ? `?${params}` : ""}`)}`,
    );
  if (
    result.kind === "forbidden" ||
    result.kind === "disabled" ||
    result.kind === "not_found"
  )
    notFound();
  if (result.kind === "unavailable")
    return (
      <AdminShell active="users">
        <section className="admin-panel">
          <h1>사용자 데이터를 불러오지 못했습니다.</h1>
        </section>
      </AdminShell>
    );
  return (
    <AdminShell active="users">
      <AdminPageHeading eyebrow="USERS" title="사용자">
        <AdminFilters
          query={query}
          action="/admin2/users"
          showPlanStatus
          showPageSize
          preserveSearch
        />
      </AdminPageHeading>
      <AdminUserTable
        query={query}
        users={result.data}
        basePath="/admin2/users"
        includePageSize
        explicitDetailLink
      />
    </AdminShell>
  );
}
