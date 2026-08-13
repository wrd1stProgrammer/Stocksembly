import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { selectNextEarnings } from "@/src/briefing/domain/briefingEarnings";
import type {
  BriefingEditionPayload,
  BriefingRoomState,
  BriefingWatchlistItem,
} from "@/src/briefing/domain/contracts";
import { nextUsPremarketBriefingAt } from "@/src/briefing/domain/marketCalendar";
import { BriefingRoom } from "@/src/components/briefing/BriefingRoom";

export const dynamic = "force-dynamic";

type PreviewFile = {
  readonly editions: readonly {
    readonly briefingId: string;
    readonly item: BriefingWatchlistItem;
    readonly payload: BriefingEditionPayload;
  }[];
};

export default async function BriefingPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const raw = await readFile(
    join(process.cwd(), ".artifacts", "briefing-local-preview.json"),
    "utf8",
  );
  const preview = JSON.parse(raw) as PreviewFile;
  const details = Object.fromEntries(
    preview.editions.map((edition) => [edition.briefingId, edition.payload]),
  );
  const watchlist = [
    ...new Map(
      preview.editions.map((edition) => [edition.item.symbol, edition.item]),
    ).values(),
  ].map((item, position) => ({ ...item, position }));
  const state: BriefingRoomState = {
    authenticated: true,
    tier: "pro",
    enabled: true,
    watchlistLimit: 3,
    nextBriefingAt: nextUsPremarketBriefingAt(),
    marketTimeZone: "America/New_York",
    watchlist,
    briefings: preview.editions.map(({ briefingId, payload }) => {
      const earnings = selectNextEarnings(payload);
      return {
        briefingId,
        symbol: payload.symbol,
        company: payload.company,
        locale: payload.locale,
        marketDate: payload.marketDate,
        generatedAt: payload.generatedAt,
        status: payload.status,
        attention: payload.attention,
        headline: payload.headline,
        summary: payload.summary,
        price: payload.price,
        ...(earnings === undefined ? {} : { nextEarnings: earnings }),
        unread: true,
      };
    }),
    unreadCount: preview.editions.length,
  };
  return (
    <BriefingRoom initialState={state} initialDetails={details} locale="ko" />
  );
}
