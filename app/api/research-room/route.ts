import { NextResponse } from "next/server";
import { appLocaleFromValue } from "@/src/lib/i18n";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
import {
  listResearchRoomReportPage,
  RESEARCH_ROOM_PAGE_SIZE,
  type ResearchRoomScope,
  type ResearchRoomSort,
} from "@/src/research/server/researchRoom/researchRoomCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const requested = Number.parseInt(
    url.searchParams.get("limit") ?? String(RESEARCH_ROOM_PAGE_SIZE),
    10,
  );
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), RESEARCH_ROOM_PAGE_SIZE)
    : RESEARCH_ROOM_PAGE_SIZE;
  const requestedPage = Number.parseInt(
    url.searchParams.get("page") ?? "1",
    10,
  );
  const page = Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1;
  const sort: ResearchRoomSort =
    url.searchParams.get("sort") === "popular" ? "popular" : "latest";
  const rawScope = url.searchParams.get("scope");
  const scope: ResearchRoomScope =
    rawScope === "committee" ||
    rawScope === "market" ||
    rawScope === "company" ||
    rawScope === "financial" ||
    rawScope === "risk"
      ? rawScope
      : "all";
  const requestedCompany = url.searchParams.get("company");
  const requestedQuery = url.searchParams.get("q");
  const locale = appLocaleFromValue(url.searchParams.get("lang"));
  const access = await (await getLiveResearchApi()).researchRoomAccess(request);
  const reportPage = await listResearchRoomReportPage(access, {
    limit,
    offset: (page - 1) * limit,
    scope,
    sort,
    locale,
    ...(requestedCompany === null ? {} : { company: requestedCompany }),
    ...(requestedQuery === null ? {} : { query: requestedQuery }),
  });
  return NextResponse.json(
    {
      access,
      companies: reportPage.companies,
      page,
      pageSize: limit,
      reports: reportPage.reports,
      total: reportPage.total,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
