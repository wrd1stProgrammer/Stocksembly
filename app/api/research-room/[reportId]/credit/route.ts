import { z } from "zod";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { readonly params: Promise<{ readonly reportId: string }> };

export async function POST(
  request: Request,
  { params }: Props,
): Promise<Response> {
  const { reportId } = await params;
  if (!z.string().uuid().safeParse(reportId).success) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const credit = await (await getLiveResearchApi()).consumeResearchRoomCredit(
    request,
    reportId,
  );
  return Response.json(credit, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
