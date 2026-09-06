import { z } from "zod";
import { parseStoredResearchReportVersioned } from "../../domain/reportStorage";
import { loadResearchRoomReport } from "../researchRoom/researchRoomCatalog";
import { requiresResearchRoomViewCredit } from "../researchRoom/researchRoomIndexability";
import { getLiveResearchApi } from "./liveResearchApi";

type AccessibleReport = {
  report: ReturnType<typeof parseStoredResearchReportVersioned>;
  symbol?: string;
  createdAt?: string;
};

export async function loadAccessibleResearchReport(
  request: Request,
  reportId: string,
): Promise<AccessibleReport | Response> {
  if (!z.string().uuid().safeParse(reportId).success)
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const api = await getLiveResearchApi();
  const reportUrl = new URL(
    `/api/research/reports/${encodeURIComponent(reportId)}`,
    request.url,
  );
  const response = await api.handle(
    new Request(reportUrl, { headers: request.headers }),
  );
  if (response.ok) {
    const body: unknown = await response.json();
    try {
      return {
        report: parseStoredResearchReportVersioned(
          typeof body === "object" && body !== null
            ? Reflect.get(body, "report")
            : undefined,
        ),
      };
    } catch {
      return Response.json({ error: "REPORT_INVALID" }, { status: 500 });
    }
  }
  if (![401, 403, 404].includes(response.status)) return response;
  const now = new Date();
  const access = await api.researchRoomAccess(request);
  const room = await loadResearchRoomReport(reportId, access, now);
  if (room === undefined)
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (room === "locked")
    return Response.json({ error: "MEMBERSHIP_REQUIRED" }, { status: 403 });
  if (requiresResearchRoomViewCredit(room.item.publishedAt, now)) {
    const credit = await api.consumeResearchRoomCredit(request, reportId);
    if (!credit.allowed)
      return Response.json({ error: "INSUFFICIENT_CREDITS" }, { status: 402 });
  }
  return {
    report: room.report,
    symbol: room.item.symbol,
    createdAt: room.item.publishedAt,
  };
}
