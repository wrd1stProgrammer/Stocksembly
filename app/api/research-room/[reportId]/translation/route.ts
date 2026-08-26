import { z } from "zod";
import type { ResearchFileData } from "@/src/research/compositions/types";
import {
  getLiveResearchApi,
  prepareLiveResearchRuntime,
} from "@/src/research/server/api/liveResearchApi";
import { loadResearchRoomReport } from "@/src/research/server/researchRoom/researchRoomCatalog";
import { translatedResearchFile } from "@/src/research/server/researchRoom/researchRoomLocalizations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { readonly params: Promise<{ readonly reportId: string }> };

const RequestSchema = z.object({ targetLocale: z.enum(["en", "ko"]) });

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
      { file: report.file, question: report.item.question, charged: 0 },
      { headers: { "Cache-Control": "private, no-store" } },
    );

  let file: ResearchFileData;
  try {
    const runtime = await prepareLiveResearchRuntime();
    file = await translatedResearchFile(
      runtime.databasePath,
      reportId,
      report.file,
      report.item.locale,
      body.data.targetLocale,
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "production")
      process.stderr.write(
        `${JSON.stringify({
          kind: "research_report_translation_failed",
          errorName: error instanceof Error ? error.name : "Unknown",
        })}\n`,
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
      file,
      question: report.item.question,
      charged: credit.required,
      remaining: credit.remaining,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
