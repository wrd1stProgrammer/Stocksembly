import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

function nextEarnings(payload: BriefingEditionPayload) {
  if (payload.earnings?.nextReportAt !== undefined)
    return {
      name: "Earnings",
      scheduledAt: payload.earnings.nextReportAt,
      whyItMatters: "Next scheduled earnings release",
      certainty: "estimated" as const,
    };
  return payload.upcomingEvents.find((event) =>
    /earnings|results|실적/iu.test(event.name),
  );
}

export default async function BriefingPreviewPage() {
  if (process.env.NODE_ENV === "production") return null;
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
      const earnings = nextEarnings(payload);
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
