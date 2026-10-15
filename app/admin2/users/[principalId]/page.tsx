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
import { AdminShell } from "@/src/components/admin/AdminShell";
import { AdminUserDetail } from "@/src/components/admin/AdminUserDetail";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "사용자 상세 · 관리자",
  robots: { index: false, follow: false },
};
type Props = {
  readonly params: Promise<{ readonly principalId: string }>;
  readonly searchParams: Promise<PageSearchParams>;
};

export default async function Admin2UserPage({ params, searchParams }: Props) {
  const { principalId } = await params;
  const queryParams = pageUrlSearchParams(await searchParams);
  let query: AdminAnalyticsQuery;
  try {
    query = parseAdminAnalyticsQuery(queryParams);
  } catch {
    redirect(`/admin2/users/${principalId}?range=30`);
  }
  const pathname = `/admin2/users/${principalId}`;
  const result = await (await getLiveResearchApi()).adminAnalyticsUser(
    await adminPageRequest(pathname, queryParams),
    principalId,
    query,
  );
  if (result.kind === "unauthenticated")
    redirect(
      `/login?next=${encodeURIComponent(`${pathname}${queryParams.size > 0 ? `?${queryParams}` : ""}`)}`,
    );
  if (
    result.kind === "forbidden" ||
    result.kind === "disabled" ||
    result.kind === "not_found" ||
    result.kind === "unavailable"
  )
    notFound();
  return (
    <AdminShell active="users">
      <nav className="admin-breadcrumb" aria-label="현재 위치">
        <span>사용자</span>
        <span aria-hidden="true">›</span>
        <strong>
          {result.data.user.displayName ||
            result.data.user.email ||
            principalId}
        </strong>
      </nav>
      <AdminUserDetail
        data={result.data}
        backQuery={queryParams.toString()}
        backPath="/admin2/users"
        embedded
        showTimelineLimit
      />
    </AdminShell>
  );
}
