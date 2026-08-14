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
import { AdminDashboard } from "@/src/components/admin/AdminDashboard";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "관리자 대시보드",
  robots: { index: false, follow: false },
};

type Props = { readonly searchParams: Promise<PageSearchParams> };

export default async function AdminPage({ searchParams }: Props) {
  const params = pageUrlSearchParams(await searchParams);
  let query: AdminAnalyticsQuery;
  try {
    query = parseAdminAnalyticsQuery(params);
  } catch {
    redirect("/admin?range=30");
  }
  const result = await (await getLiveResearchApi()).adminAnalyticsOverview(
    await adminPageRequest("/admin", params),
    query,
  );
  if (result.kind === "unauthenticated") {
    const next = `/admin${params.size > 0 ? `?${params.toString()}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (result.kind === "forbidden" || result.kind === "disabled") notFound();
  if (result.kind === "not_found") notFound();
  if (result.kind === "unavailable") {
    return (
      <main className="admin-detail">
        <section className="admin-panel">
          <p>ADMIN ANALYTICS</p>
          <h1>데이터를 불러오지 못했습니다.</h1>
          <p className="admin-panel__note">
            데이터베이스 연결과 관리자 분석 마이그레이션 상태를 확인해주세요.
          </p>
        </section>
      </main>
    );
  }
  return <AdminDashboard data={result.data} />;
}
