// biome-ignore-all format: deterministic provider fixtures stay compact and local to the characterization.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InsightSentryBarSet } from "../../research/server/data/insightsentry/insightSentryMarket";
import type { BriefingWatchlistItem } from "../domain/contracts";

const doubles = vi.hoisted(() => ({
  quote: vi.fn(), daily: vi.fn(), fourHour: vi.fn(), companyInfo: vi.fn(),
  news: vi.fn(), documents: vi.fn(), calendar: vi.fn(), fundamentals: vi.fn(),
}));

vi.mock("../../research/server/data/insightsentry/insightSentryClient", () => ({ createInsightSentryClient: vi.fn(() => ({})) }));
vi.mock("../../research/server/data/insightsentry/insightSentryConfig", () => ({ loadInsightSentryConfig: vi.fn(() => ({})) }));
vi.mock("../../research/server/data/insightsentry/insightSentryMarket", () => ({
  createInsightSentryMarket: vi.fn(() => ({ quote: doubles.quote, comparisonDailyBars: doubles.daily, fourHourBars: doubles.fourHour, companyInfo: doubles.companyInfo })),
}));
vi.mock("../../research/server/data/insightsentry/insightSentryResearchData", () => ({
  createInsightSentryResearchDataAdapter: vi.fn(() => ({ news: doubles.news, documents: doubles.documents, calendar: doubles.calendar, fundamentals: doubles.fundamentals })),
}));
vi.mock("../../research/server/data/insightsentry/insightSentrySemanticNewsClassifier", () => ({ createSemanticNewsClassifier: vi.fn(() => vi.fn()) }));

import { createBriefingDataCollector } from "./briefingDataCollector";

const item: BriefingWatchlistItem = {
  symbol: "NVDA", providerCode: "NASDAQ:NVDA", company: "NVIDIA Corporation",
  exchange: "NASDAQ", position: 0, createdAt: "2026-08-01T00:00:00.000Z",
};
const cutoffAt = "2026-08-05T12:30:00.000Z";
const COMPLETE_SNAPSHOT_JSON = '{"symbol":"NVDA","company":"NVIDIA Corporation","providerCode":"NASDAQ:NVDA","marketDate":"2026-08-05","cutoffAt":"2026-08-05T12:30:00.000Z","coverageStart":"2026-08-04T12:30:00.000Z","quote":{"value":125,"currency":"USD","changePercent":2.5,"marketState":"PRE","observedAt":"2026-08-05T12:30:00.000Z"},"signals":[{"id":"news:1","kind":"company","direction":"positive","title":"NVIDIA wins a major factory order","detail":"Order raises revenue visibility.","investmentMeaning":"The signal matters only if it lifts the next revenue, margin, or cash-flow checkpoint.","occurredAt":"2026-08-05T10:00:00.000Z","sourceUrl":"https://example.com/a"},{"id":"news:2","kind":"risk","direction":"negative","title":"NVIDIA faces license delay","detail":"Approval timing moved.","investmentMeaning":"This can change the downside distribution before it changes reported earnings.","occurredAt":"2026-08-05T09:00:00.000Z","sourceUrl":"https://example.com/b"},{"id":"document:10-q","kind":"company","direction":"neutral","title":"NVIDIA quarterly filing","detail":"quarterly · Primary filing evidence","investmentMeaning":"A new primary document can alter the operating evidence before market commentary catches up.","occurredAt":"2026-08-05T08:00:00.000Z"},{"id":"price:2026-08-05","kind":"price","direction":"positive","title":"NVDA +2.50%","detail":"The latest pre quote moved 2.50% from the previous close.","investmentMeaning":"The move is actionable only if volume and the new information point in the same direction after the open.","occurredAt":"2026-08-05T12:30:00.000Z"}],"upcomingEvents":[{"name":"NVDA earnings","scheduledAt":"2026-08-20T20:00:00.000Z","whyItMatters":"The release resets the market\'s revenue, margin, and forward-guidance assumptions.","certainty":"confirmed"}],"fundamentals":{"total_revenue_ttm":1000},"fundamentalSeries":{"total_revenue_fq":[{"observedAt":"2025-07-30T12:00:00.000Z","value":250}]},"marketReference":{"previousClose":120,"previousHigh":121,"previousLow":118,"averageVolume20d":1095,"high20d":121,"low20d":99,"premarketGapPercent":4.17},"technicalReference":{"timeframe":"4h","observedAt":"2026-07-20T12:00:00.000Z","barCount":20,"trend":"mixed","sma20":110.5,"sma50":110.5,"rsi14":100,"atr14":3,"volumeRatio20":1.09,"support":110.5,"resistance":121},"earnings":{"nextReportAt":"2026-08-20T20:00:00.000Z","nextEpsForecast":1.2,"epsActual":1.1,"epsForecast":1,"nextReportCertainty":"confirmed"},"backgroundFinancialContext":{"documents":[{"id":"10-q","category":"quarterly","title":"NVIDIA quarterly filing","reportedAt":"2026-08-05T08:00:00.000Z","publishedAt":"2026-08-05T08:00:00.000Z","excerpt":"Primary filing evidence"}],"epsComparison":{"availability":"available","basis":"same_report","actual":1.1,"forecast":1},"oneOffInterpretation":"unavailable"},"sources":[{"title":"**NVIDIA** wins a major factory order","publisher":"Wire","publishedAt":"2026-08-05T10:00:00.000Z","url":"https://example.com/a"},{"title":"NVIDIA faces license delay","publisher":"example.com","publishedAt":"2026-08-05T09:00:00.000Z","url":"https://example.com/b"}],"limitations":[]}';
const PARTIAL_SNAPSHOT_JSON = '{"symbol":"NVDA","company":"NVIDIA Corporation","providerCode":"NASDAQ:NVDA","marketDate":"2026-08-05","cutoffAt":"2026-08-05T12:30:00.000Z","coverageStart":"2026-08-03T12:30:00.000Z","quote":{},"signals":[],"upcomingEvents":[],"fundamentals":{},"fundamentalSeries":{},"sources":[],"limitations":["quote","market_daily","technical_4h","company_info","news","documents","calendar","fundamentals"]}';
const providerMeta = {
  pitSafe: false as const, limitations: ["provider_dataset_not_point_in_time_safe"] as const,
  providerUpdatedAt: cutoffAt, retrievedAt: cutoffAt,
};

function available<T>(data: T): { readonly status: "available"; readonly data: T } {
  return { status: "available", data };
}

function bars(timeframe: "1d" | "4h", count: number): InsightSentryBarSet {
  const values = Array.from({ length: count }, (_, index) => ({
    timestamp: new Date(Date.parse("2026-07-01T12:00:00.000Z") + index * 86_400_000).toISOString(),
    timeframe, open: 100 + index, high: 102 + index, low: 99 + index,
    close: 101 + index, volume: 1_000 + index * 10,
  }));
  return { timeframe, bars: values, coverage: {
    observedStart: values[0]?.timestamp ?? cutoffAt, observedEnd: values.at(-1)?.timestamp ?? cutoffAt,
    barCount: count, requestedBarCount: count, partial: false,
  } };
}

function configureComplete(): void {
  doubles.quote.mockResolvedValue({ providerCode: item.providerCode, marketState: "PRE", observedAt: cutoffAt, lastPrice: 125, changePercent: 2.5, currency: "USD" });
  doubles.daily.mockResolvedValue(bars("1d", 20));
  doubles.fourHour.mockResolvedValue(bars("4h", 20));
  doubles.companyInfo.mockResolvedValue({ providerCode: item.providerCode, earnings: { nextReportAt: "2026-08-20T20:00:00.000Z", nextEpsForecast: 1.2 } });
  doubles.news.mockResolvedValue(available({
    ...providerMeta, symbol: item.providerCode, providerCalls: 1, rawItemCount: 2,
    events: [
      { eventKey: "news:1", category: "company", direction: "positive", title: "**NVIDIA** wins a major factory order", publishedAt: "2026-08-05T10:00:00.000Z", source: "Wire", link: "https://example.com/a" },
      { eventKey: "news:2", category: "risk", direction: "negative", title: "NVIDIA faces license delay", publishedAt: "2026-08-05T09:00:00.000Z", link: "https://example.com/b" },
    ],
    excerpts: [{ eventKey: "news:1", content: "[Order](https://example.com) raises revenue visibility." }, { eventKey: "news:2", content: "Approval timing moved." }], providerEvidence: [],
  }));
  doubles.documents.mockResolvedValue(available({ ...providerMeta, symbol: item.providerCode, documents: [
    { id: "10-q", category: "quarterly", title: "NVIDIA quarterly filing", reportedAt: "2026-08-05T08:00:00.000Z", publishedAt: "2026-08-05T08:00:00.000Z", content: "Primary   filing evidence" },
  ] }));
  doubles.calendar.mockResolvedValue(available({ ...providerMeta, symbol: item.providerCode, windowStart: cutoffAt, windowEnd: "2026-11-03T12:30:00.000Z", events: [
    { symbol: item.providerCode, name: "earnings", reportAt: "2026-08-20T20:00:00.000Z" },
  ], earnings: { epsActual: 1.1, epsForecast: 1, nextReportAt: "2026-08-20T20:00:00.000Z" } }));
  doubles.fundamentals.mockResolvedValue(available({ ...providerMeta, symbol: item.providerCode,
    indicators: [{ id: "total_revenue_ttm", value: 1000 }, { id: "ignored", value: 7 }],
    series: [{ id: "total_revenue_fq", name: "Revenue", points: [{ time: 1_753_876_800, value: 250 }] }], unavailableSeriesIds: [],
  }));
}

function configureUnavailable(): void {
  const unavailable = { status: "unavailable", limitation: "provider_unavailable" };
  doubles.quote.mockRejectedValueOnce(new TypeError("quote unavailable"));
  doubles.daily.mockRejectedValueOnce(new TypeError("daily unavailable"));
  doubles.fourHour.mockRejectedValueOnce(new TypeError("bars unavailable"));
  doubles.companyInfo.mockRejectedValueOnce(new TypeError("info unavailable"));
  doubles.news.mockResolvedValueOnce(unavailable); doubles.documents.mockResolvedValueOnce(unavailable);
  doubles.calendar.mockResolvedValueOnce(unavailable); doubles.fundamentals.mockResolvedValueOnce(unavailable);
}

describe("briefing data collector characterization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves complete and partial snapshot assembly", async () => {
    configureComplete();
    const collector = createBriefingDataCollector({ dataRoot: "/tmp/fixture" });
    const complete = await collector.collect({ item, marketDate: "2026-08-05", cutoffAt, previousEventKeys: [] });
    configureUnavailable();
    const partial = await collector.collect({ item, marketDate: "2026-08-05", cutoffAt, previousEventKeys: [], previousBriefingAt: "2026-08-03T12:30:00.000Z" });

    expect(JSON.stringify(complete)).toBe(COMPLETE_SNAPSHOT_JSON);
    expect(complete).toEqual(JSON.parse(COMPLETE_SNAPSHOT_JSON));
    expect(JSON.stringify(partial)).toBe(PARTIAL_SNAPSHOT_JSON);
    expect([complete, complete.signals, complete.upcomingEvents, complete.sources, complete.limitations, complete.fundamentals, complete.fundamentalSeries].every(Object.isFrozen)).toBe(true);
  });

  it("preserves editorial ordering and reserves the six-signal cap for price", async () => {
    doubles.quote.mockResolvedValue({ providerCode: item.providerCode, marketState: "OPEN", changePercent: 1 });
    doubles.daily.mockRejectedValue(new TypeError("daily unavailable")); doubles.fourHour.mockRejectedValue(new TypeError("bars unavailable"));
    doubles.companyInfo.mockResolvedValue({ providerCode: item.providerCode });
    doubles.news.mockResolvedValue(available({ ...providerMeta, symbol: item.providerCode, providerCalls: 1, rawItemCount: 6,
      events: ["revenue", "margin", "factory", "license", "shipment", "contract"].map((topic, index) => ({ eventKey: `news:${index}`, category: "company" as const, direction: "neutral" as const, title: `NVIDIA ${topic}`, publishedAt: `2026-08-05T0${index}:00:00.000Z` })), excerpts: [], providerEvidence: [],
    }));
    doubles.documents.mockResolvedValue(available({ ...providerMeta, symbol: item.providerCode, documents: [{ id: "filing", category: "quarterly", title: "NVIDIA filing", reportedAt: cutoffAt, publishedAt: cutoffAt, content: "evidence" }] }));
    doubles.calendar.mockResolvedValue(available({ ...providerMeta, symbol: item.providerCode, windowStart: cutoffAt, windowEnd: cutoffAt, events: [] }));
    doubles.fundamentals.mockResolvedValue(available({ ...providerMeta, symbol: item.providerCode, indicators: [], series: [], unavailableSeriesIds: [] }));

    const snapshot = await createBriefingDataCollector({ dataRoot: "/tmp/fixture" }).collect({ item, marketDate: "2026-08-05", cutoffAt, previousEventKeys: [] });
    expect(snapshot.signals.map((signal) => signal.id)).toEqual(["news:0", "news:1", "news:2", "news:3", "news:4", "price:2026-08-05"]);
  });
});
