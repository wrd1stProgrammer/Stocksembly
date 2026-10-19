import { TickerSymbolSchema } from "@/src/research/domain/ids";
import {
  recordedResearchDemo,
  selectResearchDemo,
} from "@/src/research/server/onboarding/researchDemo";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const symbol = TickerSymbolSchema.safeParse(
    new URL(request.url).searchParams.get("symbol"),
  );
  if (!symbol.success)
    return Response.json({ error: "INVALID_SYMBOL" }, { status: 400 });
  const sample = await selectResearchDemo(symbol.data).catch(() =>
    recordedResearchDemo(),
  );
  return Response.json(sample, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
