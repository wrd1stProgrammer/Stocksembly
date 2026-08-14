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

export default async function AdminUserPage({ params, searchParams }: Props) {
  const { principalId } = await params;
  const queryParams = pageUrlSearchParams(await searchParams);
  let query: AdminAnalyticsQuery;
  try {
    query = parseAdminAnalyticsQuery(queryParams);
  } catch {
    redirect(`/admin/users/${principalId}?range=30`);
  }
  const pathname = `/admin/users/${principalId}`;
  const result = await (await getLiveResearchApi()).adminAnalyticsUser(
    await adminPageRequest(pathname, queryParams),
    principalId,
    query,
  );
  if (result.kind === "unauthenticated")
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  if (
    result.kind === "forbidden" ||
    result.kind === "disabled" ||
    result.kind === "not_found" ||
    result.kind === "unavailable"
  )
    notFound();
  return (
    <AdminUserDetail data={result.data} backQuery={queryParams.toString()} />
  );
}
