import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locale } from "../../lib/i18n";
import type {
  BriefingEditionPayload,
  BriefingListItem,
  BriefingRoomState,
  BriefingWatchlistItem,
} from "../domain/contracts";

type PreviewEdition = {
  readonly briefingId: string;
  readonly item: BriefingWatchlistItem;
  readonly payload: BriefingEditionPayload;
};

async function previewEditions(): Promise<readonly PreviewEdition[]> {
  if (process.env.NODE_ENV === "production") return [];
  try {
    const raw = await readFile(
      join(process.cwd(), ".artifacts", "briefing-local-preview.json"),
      "utf8",
    );
    return (
      (JSON.parse(raw) as { readonly editions?: readonly PreviewEdition[] })
        .editions ?? []
    );
  } catch {
    return [];
  }
}

function nextEarnings(payload: BriefingEditionPayload) {
  const confirmedEvent = payload.upcomingEvents.find(
    (event) =>
      event.certainty === "confirmed" &&
      /earnings|results|실적/iu.test(event.name),
  );
  if (confirmedEvent !== undefined) return confirmedEvent;
  if (
    payload.earnings?.nextReportAt !== undefined &&
    payload.earnings.nextReportCertainty === "confirmed"
  )
    return {
      name: "Earnings",
      scheduledAt: payload.earnings.nextReportAt,
      whyItMatters: "Next scheduled earnings release",
      certainty: "confirmed" as const,
    };
  return undefined;
}

function listItem(edition: PreviewEdition): BriefingListItem {
  const { payload } = edition;
  const earnings = nextEarnings(payload);
  return {
    briefingId: edition.briefingId,
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
    unread: false,
  };
}

export async function loadLocalBriefingOverlay(locale: Locale) {
  const editions = (await previewEditions()).filter(
    (edition) => edition.payload.locale === locale,
  );
  return {
    editions,
    details: Object.fromEntries(
      editions.map((edition) => [edition.briefingId, edition.payload]),
    ) as Readonly<Record<string, BriefingEditionPayload>>,
    briefings: editions.map(listItem),
  };
}

export function mergeLocalBriefingOverlay(
  state: BriefingRoomState,
  overlay: Awaited<ReturnType<typeof loadLocalBriefingOverlay>>,
): BriefingRoomState {
  if (!state.authenticated || !state.enabled || overlay.editions.length === 0)
    return state;
  const activatedAtBySymbol = new Map(
    state.watchlist.map((item) => [item.symbol, Date.parse(item.createdAt)]),
  );
  const localBriefings = overlay.briefings.filter((item) => {
    const activatedAt = activatedAtBySymbol.get(item.symbol);
    const generatedAt = Date.parse(item.generatedAt);
    return (
      activatedAt !== undefined &&
      Number.isFinite(activatedAt) &&
      Number.isFinite(generatedAt) &&
      generatedAt >= activatedAt
    );
  });
  const briefings = [...localBriefings, ...state.briefings]
    .filter(
      (item, index, items) =>
        items.findIndex(
          (candidate) => candidate.briefingId === item.briefingId,
        ) === index,
    )
    .sort(
      (left, right) =>
        Date.parse(right.generatedAt) - Date.parse(left.generatedAt),
    );
  return {
    ...state,
    briefings,
    unreadCount: state.unreadCount,
  };
}

export async function localBriefingDetail(briefingId: string) {
  return (await previewEditions()).find(
    (edition) => edition.briefingId === briefingId,
  )?.payload;
}
