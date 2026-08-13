import type { PeersDataset } from "../../research/server/data/insightsentry/insightSentryResearchContracts";
import type {
  BriefingEarningsSnapshot,
  BriefingFinancialContext,
  BriefingFundamentalPoint,
  BriefingSignal,
  BriefingUpcomingEvent,
  BriefingWatchlistItem,
} from "../domain/contracts";
import type { BriefingCollectorResponses } from "./briefingCollectorClients";
import { buildBriefingFinancialContext } from "./briefingFinancialContext";

const FUNDAMENTAL_KEYS = new Set([
  "total_revenue_ttm",
  "revenue_one_year_growth_ttm",
  "gross_margin_ttm",
  "operating_margin_fq",
  "net_margin_ttm",
  "free_cash_flow_ttm",
  "market_cap_basic",
  "price_earnings",
  "price_earnings_forward_fq",
  "enterprise_value_ebitda_fq",
  "return_on_equity_ttm",
  "return_on_invested_capital_fq",
  "price_target_average",
  "revenue_estimate_ntm",
  "eps_estimate_ntm",
]);

function earningsCertainty(
  reportAt: string,
  cutoffAt: string,
): "confirmed" | "estimated" {
  const scheduled = new Date(reportAt);
  const leadDays =
    (scheduled.getTime() - Date.parse(cutoffAt)) / (24 * 60 * 60 * 1_000);
  const placeholder =
    scheduled.getUTCHours() === 12 &&
    scheduled.getUTCMinutes() === 0 &&
    scheduled.getUTCSeconds() === 0;
  return leadDays > 0 && leadDays <= 45 && !placeholder
    ? "confirmed"
    : "estimated";
}

function mergeEarnings(
  primary: BriefingEarningsSnapshot | undefined,
  fallback: BriefingEarningsSnapshot | undefined,
): BriefingEarningsSnapshot | undefined {
  if (primary === undefined && fallback === undefined) return undefined;
  const merged = Object.fromEntries(
    Object.entries({ ...fallback, ...primary }).filter(
      ([, value]) => value !== undefined,
    ),
  );
  return Object.keys(merged).length === 0 ? undefined : Object.freeze(merged);
}

function fundamentalSeries(
  series:
    | readonly {
        readonly id: string;
        readonly points: readonly Readonly<Record<string, number>>[];
      }[]
    | undefined,
): Readonly<Record<string, readonly BriefingFundamentalPoint[]>> {
  return Object.freeze(
    Object.fromEntries(
      (series ?? []).flatMap((item) => {
        const points = item.points.slice(-12).flatMap((point) => {
          const value = Object.entries(point).find(
            ([key, candidate]) => key !== "time" && Number.isFinite(candidate),
          )?.[1];
          // biome-ignore lint/complexity/useLiteralKeys: provider series uses an index signature.
          const time = point["time"];
          if (value === undefined || time === undefined) return [];
          const observedAt = new Date(
            time >= 100_000_000_000 ? time : time * 1_000,
          ).toISOString();
          return [Object.freeze({ observedAt, value })];
        });
        return points.length === 0
          ? []
          : [[item.id, Object.freeze(points)] as const];
      }),
    ),
  );
}

export function mapBriefingFinancials(input: {
  readonly responses: BriefingCollectorResponses;
  readonly item: BriefingWatchlistItem;
  readonly startAt: string;
  readonly cutoffAt: string;
  readonly peers?: PeersDataset;
}): {
  readonly documentSignals: readonly BriefingSignal[];
  readonly upcomingEvents: readonly BriefingUpcomingEvent[];
  readonly fundamentals: Readonly<Record<string, number | string>>;
  readonly fundamentalSeries: Readonly<
    Record<string, readonly BriefingFundamentalPoint[]>
  >;
  readonly earnings?: BriefingEarningsSnapshot;
  readonly backgroundFinancialContext?: BriefingFinancialContext;
  readonly limitations: readonly string[];
} {
  const { documents, calendar, fundamentals, companyInfo } = input.responses;
  const limitations: string[] = [];
  if (companyInfo.status !== "fulfilled") limitations.push("company_info");
  const documentData =
    documents.status === "fulfilled" && documents.value.status === "available"
      ? documents.value.data
      : undefined;
  if (documentData === undefined) limitations.push("documents");
  const documentSignals = (documentData?.documents ?? [])
    .filter(
      (document) =>
        Date.parse(document.publishedAt) >= Date.parse(input.startAt) &&
        Date.parse(document.publishedAt) <= Date.parse(input.cutoffAt),
    )
    .slice(0, 2)
    .map((document) => ({
      id: `document:${document.id}`,
      kind: "company" as const,
      direction: "neutral" as const,
      title: document.title,
      detail: `${document.category} · ${document.content.slice(0, 360).replaceAll(/\s+/gu, " ")}`,
      investmentMeaning:
        "A new primary document can alter the operating evidence before market commentary catches up.",
      occurredAt: document.publishedAt,
    }));
  const calendarData =
    calendar.status === "fulfilled" && calendar.value.status === "available"
      ? calendar.value.data
      : undefined;
  if (calendarData === undefined) limitations.push("calendar");
  const merged = mergeEarnings(
    calendarData?.earnings,
    companyInfo.status === "fulfilled" ? companyInfo.value.earnings : undefined,
  );
  const earnings =
    merged?.nextReportAt === undefined
      ? merged
      : Object.freeze({
          ...merged,
          nextReportCertainty: earningsCertainty(
            merged.nextReportAt,
            input.cutoffAt,
          ),
        });
  const backgroundFinancialContext = buildBriefingFinancialContext({
    symbol: input.item.symbol,
    documents: documentData?.documents ?? [],
    ...(earnings === undefined ? {} : { earnings }),
    ...(input.peers === undefined ? {} : { peers: input.peers }),
    cutoffAt: input.cutoffAt,
  });
  const calendarEnd = Date.parse(input.cutoffAt) + 90 * 24 * 60 * 60 * 1_000;
  const calendarEvents: BriefingUpcomingEvent[] = (calendarData?.events ?? [])
    .filter(
      (event) =>
        Date.parse(event.reportAt) > Date.parse(input.cutoffAt) &&
        Date.parse(event.reportAt) <= calendarEnd,
    )
    .slice(0, 3)
    .map((event) => ({
      name: `${input.item.symbol} earnings`,
      scheduledAt: event.reportAt,
      whyItMatters:
        "The release resets the market's revenue, margin, and forward-guidance assumptions.",
      certainty: earningsCertainty(event.reportAt, input.cutoffAt),
    }));
  const fallbackEvents: BriefingUpcomingEvent[] =
    earnings?.nextReportAt !== undefined &&
    Date.parse(earnings.nextReportAt) > Date.parse(input.cutoffAt) &&
    Date.parse(earnings.nextReportAt) <= calendarEnd &&
    !calendarEvents.some((event) => event.scheduledAt === earnings.nextReportAt)
      ? [
          {
            name: `${input.item.symbol} earnings`,
            scheduledAt: earnings.nextReportAt,
            whyItMatters:
              earnings.nextEpsForecast === undefined
                ? "The release resets revenue, margin, and forward-guidance assumptions."
                : `The current next-quarter EPS consensus is ${earnings.nextEpsForecast.toFixed(2)}; the release tests whether growth and margin can defend it.`,
            certainty: earnings.nextReportCertainty ?? "estimated",
          },
        ]
      : [];
  const upcomingEvents = [...calendarEvents, ...fallbackEvents]
    .sort(
      (left, right) =>
        Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt),
    )
    .slice(0, 3);
  const fundamentalData =
    fundamentals.status === "fulfilled" &&
    fundamentals.value.status === "available"
      ? fundamentals.value.data
      : undefined;
  if (fundamentalData === undefined) limitations.push("fundamentals");
  const selected = Object.fromEntries(
    (fundamentalData?.indicators ?? []).flatMap((indicator) =>
      FUNDAMENTAL_KEYS.has(indicator.id) &&
      (typeof indicator.value === "number" ||
        typeof indicator.value === "string")
        ? [[indicator.id, indicator.value] as const]
        : [],
    ),
  );
  return {
    documentSignals,
    upcomingEvents,
    fundamentals: Object.freeze(selected),
    fundamentalSeries: fundamentalSeries(fundamentalData?.series),
    ...(earnings === undefined ? {} : { earnings }),
    ...(backgroundFinancialContext === undefined
      ? {}
      : { backgroundFinancialContext }),
    limitations,
  };
}
