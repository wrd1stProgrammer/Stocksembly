import { z } from "zod";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
import {
  answerFromPublishedReport,
  loadResearchRoomReport,
} from "@/src/research/server/researchRoom/researchRoomCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({
  question: z.string().trim().min(2).max(600),
  locale: z.enum(["en", "ko"]),
});

type Props = { readonly params: Promise<{ readonly reportId: string }> };

export async function POST(
  request: Request,
  { params }: Props,
): Promise<Response> {
  const { reportId } = await params;
  if (!z.string().uuid().safeParse(reportId).success)
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const parsed = InputSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return Response.json({ error: "QUESTION_INVALID" }, { status: 400 });
  const access = await (await getLiveResearchApi()).researchRoomAccess(request);
  const report = await loadResearchRoomReport(reportId, access);
  if (report === "locked")
    return Response.json({ error: "REPORT_LOCKED" }, { status: 403 });
  if (report === undefined)
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  return Response.json(
    {
      answer: answerFromPublishedReport(
        report.file,
        parsed.data.question,
        parsed.data.locale,
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
