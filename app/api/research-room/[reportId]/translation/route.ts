import { z } from "zod";
import type { ResearchLocale } from "@/src/lib/i18n";
import type { PublicRunDetail } from "@/src/research/client/schemas";
import type { ResearchFileData } from "@/src/research/compositions/types";
import {
  getLiveResearchApi,
  prepareLiveResearchRuntime,
} from "@/src/research/server/api/liveResearchApi";
import { loadResearchRoomReport } from "@/src/research/server/researchRoom/researchRoomCatalog";
import { translatedResearchProjection } from "@/src/research/server/researchRoom/researchRoomLocalizations";
import { RESEARCH_TRANSLATION_LOCALES } from "@/src/research/server/researchRoom/researchTranslationLocales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { readonly params: Promise<{ readonly reportId: string }> };

const RequestSchema = z.object({
  targetLocale: z.enum(RESEARCH_TRANSLATION_LOCALES),
});

function translationFailureDetails(error: unknown) {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : undefined;
  return {
    kind: "research_report_translation_failed",
    errorName: error instanceof Error ? error.name : "Unknown",
    errorCode: typeof record?.["code"] === "string" ? record["code"] : null,
    errorPhase: typeof record?.["phase"] === "string" ? record["phase"] : null,
  };
}

export async function POST(
  request: Request,
  { params }: Props,
): Promise<Response> {
  const { reportId } = await params;
  if (!z.string().uuid().safeParse(reportId).success)
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const body = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "INVALID_LOCALE" }, { status: 400 });

  const api = await getLiveResearchApi();
  const access = await api.researchRoomAccess(request);
  if (!access.authenticated)
    return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const report = await loadResearchRoomReport(
    reportId,
    access,
    new Date(),
    body.data.targetLocale,
  );
  if (report === undefined)
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (report === "locked")
    return Response.json({ error: "MEMBERSHIP_REQUIRED" }, { status: 403 });
  if (report.item.locale === body.data.targetLocale)
    return Response.json(
      {
        file: report.file,
        question: report.item.question,
        runDetail: report.runDetail,
        conversation: report.conversation,
        renderLocale: report.item.locale satisfies ResearchLocale,
        charged: 0,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );

  let projection: {
    readonly file: ResearchFileData;
    readonly question: string;
    readonly runDetail: PublicRunDetail;
    readonly conversation: typeof report.conversation;
    readonly renderLocale: ResearchLocale;
  };
  try {
    const runtime = await prepareLiveResearchRuntime();
    projection = await translatedResearchProjection(
      runtime.databasePath,
      reportId,
      report.runDetail.run.runId,
      report.file,
      report.item.question,
      report.runDetail,
      report.conversation,
      report.item.locale,
      body.data.targetLocale,
      report.version,
      report.sourceContentHash,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify(translationFailureDetails(error))}\n`,
    );
    return Response.json({ error: "TRANSLATION_FAILED" }, { status: 502 });
  }
  const credit = await api.consumeResearchTranslationCredit(
    request,
    reportId,
    body.data.targetLocale,
  );
  if (!credit.allowed)
    return Response.json(
      {
        error: "INSUFFICIENT_CREDITS",
        remaining: credit.remaining,
        required: credit.required,
      },
      { status: 402 },
    );
  return Response.json(
    {
      file: projection.file,
      question: projection.question,
      runDetail: projection.runDetail,
      conversation: projection.conversation,
      renderLocale: projection.renderLocale,
      charged: credit.required,
      remaining: credit.remaining,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
