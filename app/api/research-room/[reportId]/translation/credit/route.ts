import { z } from "zod";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

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
  const credit = await (
    await getLiveResearchApi()
  ).consumeResearchTranslationCredit(request, reportId, body.data.targetLocale);
  return Response.json(credit, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
