import { describe, expect, it, vi } from "vitest";
import type { AccountStore } from "../../accounts/server/accountStore";
import type {
  BriefingEditionPayload,
  BriefingSourceSnapshot,
  BriefingWatchlistItem,
  SaveBriefingEdition,
} from "../domain/contracts";
import { runBriefingCycle } from "./briefingScheduler";

const nvda: BriefingWatchlistItem = {
  symbol: "NVDA",
  providerCode: "NASDAQ:NVDA",
  company: "NVIDIA Corporation",
  exchange: "NASDAQ",
  position: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
};

function payload(locale: "en" | "ko"): BriefingEditionPayload {
  return {
    schemaVersion: 1,
    symbol: "NVDA",
    company: "NVIDIA Corporation",
    locale,
    marketDate: "2026-08-05",
    generatedAt: "2026-08-05T12:30:00.000Z",
    cutoffAt: "2026-08-05T12:30:00.000Z",
    coverageStart: "2026-08-04T12:30:00.000Z",
    status: "ready",
    attention: "medium",
    headline: "A material headline",
    summary: "A sufficiently detailed and decision-useful daily summary.",
    price: {},
    materialChanges: [],
    agentViews: [],
    bullCase: "Upside case",
    bearCase: "Downside case",
    upcomingEvents: [],
    todayChecks: ["Check one", "Check two"],
    sources: [],
    limitations: [],
  };
}

describe("daily briefing cycle", () => {
  it("collects once per symbol and generates only requested missing languages", async () => {
    const saveEdition = vi.fn(
      async (_edition: SaveBriefingEdition, _recipients: readonly string[]) =>
        undefined,
    );
    const store = {
      listBriefingAudience: async () => [
        { principalId: "a", locale: "ko" as const, item: nvda },
        { principalId: "b", locale: "ko" as const, item: nvda },
        { principalId: "c", locale: "en" as const, item: nvda },
      ],
      listBriefingEditionKeys: async () => new Set<string>(),
      listBriefingEventKeys: async () => [],
      saveBriefingSourceSnapshot: async () =>
        "00000000-0000-4000-8000-000000000001",
      findPreviousBriefingEdition: async () => undefined,
      saveBriefingEdition: saveEdition,
      close: async () => undefined,
      syncUser: async () => undefined,
      recordResearchRun: async () => undefined,
      recordReportOwnership: async () => undefined,
    } satisfies AccountStore;
    const snapshot: BriefingSourceSnapshot = {
      symbol: "NVDA",
      company: nvda.company,
      providerCode: nvda.providerCode,
      marketDate: "2026-08-05",
      cutoffAt: "2026-08-05T12:30:00.000Z",
      coverageStart: "2026-08-04T12:30:00.000Z",
      quote: {},
      signals: [],
      upcomingEvents: [],
      fundamentals: {},
      sources: [],
      limitations: [],
    };
    const collect = vi.fn(async () => snapshot);
    const synthesize = vi.fn(async ({ locale }: { locale: "en" | "ko" }) =>
      payload(locale),
    );

    const result = await runBriefingCycle({
      store: store as Parameters<typeof runBriefingCycle>[0]["store"],
      collector: { collect },
      marketDate: "2026-08-05",
      scheduledFor: "2026-08-05T12:30:00.000Z",
      now: () => "2026-08-05T12:30:00.000Z",
      synthesize: synthesize as NonNullable<
        Parameters<typeof runBriefingCycle>[0]["synthesize"]
      >,
    });

    expect(collect).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(saveEdition).toHaveBeenCalledTimes(2);
    expect(saveEdition.mock.calls.map((call) => call[1]).sort()).toEqual([
      ["a", "b"],
      ["c"],
    ]);
    expect(result).toMatchObject({ audienceCount: 3, symbols: 1, editions: 2 });
  });

  it("passes bounded historical event ids to collection, not only the latest edition", async () => {
    const immediate = {
      ...payload("ko"),
      materialChanges: [
        {
          id: "immediate-event",
          kind: "company" as const,
          direction: "positive" as const,
          title: "Immediate event",
          detail: "Immediate event detail",
          investmentMeaning: "Immediate event meaning",
          occurredAt: "2026-08-04T12:00:00.000Z",
        },
      ],
    };
    const listBriefingEventKeys = vi.fn(async () => ["historical-event"]);
    const snapshot: BriefingSourceSnapshot = {
      symbol: "NVDA",
      company: nvda.company,
      providerCode: nvda.providerCode,
      marketDate: "2026-08-05",
      cutoffAt: "2026-08-05T12:30:00.000Z",
      coverageStart: "2026-08-04T12:30:00.000Z",
      quote: {},
      signals: [],
      upcomingEvents: [],
      fundamentals: {},
      sources: [],
      limitations: [],
    };
    const collect = vi.fn(async () => snapshot);
    const store = {
      listBriefingAudience: async () => [
        { principalId: "a", locale: "ko" as const, item: nvda },
      ],
      listBriefingEditionKeys: async () => new Set<string>(),
      listBriefingEventKeys,
      saveBriefingSourceSnapshot: async () =>
        "00000000-0000-4000-8000-000000000001",
      findPreviousBriefingEdition: async () => immediate,
      saveBriefingEdition: async () => undefined,
      close: async () => undefined,
      syncUser: async () => undefined,
      recordResearchRun: async () => undefined,
      recordReportOwnership: async () => undefined,
    };

    await runBriefingCycle({
      store: store as Parameters<typeof runBriefingCycle>[0]["store"],
      collector: { collect },
      marketDate: "2026-08-05",
      scheduledFor: "2026-08-05T12:30:00.000Z",
      now: () => "2026-08-05T12:30:00.000Z",
      synthesize: async () => payload("ko"),
    });

    expect(listBriefingEventKeys).toHaveBeenCalledWith(
      "NVDA",
      "ko",
      "2026-08-05",
      90,
    );
    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({
        previousEventKeys: ["historical-event", "immediate-event"],
      }),
    );
  });
});
