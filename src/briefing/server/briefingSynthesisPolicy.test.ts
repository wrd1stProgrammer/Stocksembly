import { describe, expect, it } from "vitest";
import type { BriefingSourceSnapshot } from "../domain/contracts";
import {
  localizeBriefingDraft,
  repairBriefingDraft,
} from "./briefingDraftRepair";
import { assembleBriefingEdition } from "./briefingEditionAssembler";
import { fallbackDecisionChecks } from "./briefingFallbackChecks";
import { fallbackBriefingDraft } from "./briefingFallbackDraft";
import { fallbackAgentViews } from "./briefingFallbackViews";
import type { BriefingDraft } from "./briefingSynthesisSchema";

const snapshot: BriefingSourceSnapshot = {
  symbol: "NVDA",
  company: "NVIDIA Corporation",
  providerCode: "NASDAQ:NVDA",
  marketDate: "2026-08-11",
  cutoffAt: "2026-08-11T12:30:00.000Z",
  coverageStart: "2026-08-10T12:30:00.000Z",
  quote: { value: 180, changePercent: 1.2 },
  signals: [],
  upcomingEvents: [],
  fundamentals: {},
  marketReference: { previousClose: 178, previousHigh: 181, previousLow: 176 },
  sources: [],
  limitations: [],
};

const check = {
  horizon: "today" as const,
  title: "Opening confirmation",
  timing: "First 30 minutes",
  metric: "Prior high and trading strength",
  confirmation: "Price holds above the supplied prior high.",
  ifConfirmed: "Same-day demand has stronger support.",
  ifUnclear: "Mixed evidence preserves the current view pending follow-up.",
  ifFailed: "Treat the initial move as unconfirmed.",
};

function draft(
  agentViews: readonly BriefingDraft["agentViews"][number][],
): BriefingDraft {
  return {
    headline: "A decision-relevant development",
    summary: "A sufficiently detailed summary tied only to source evidence.",
    materialChanges: [],
    agentViews: [...agentViews],
    bullCase: "The supplied upside condition holds.",
    bearCase: "The supplied downside condition fails.",
    upcomingEvents: [],
    todayChecks: [check],
    changedSincePrevious: null,
    stillWatching: null,
  };
}

describe("briefing fallback policy", () => {
  it("labels same-day checks separately from the next confirmed catalyst", () => {
    // Given
    const withEarnings: BriefingSourceSnapshot = {
      ...snapshot,
      earnings: { nextEpsForecast: 1.2 },
      upcomingEvents: [
        {
          name: "Q2 earnings",
          scheduledAt: "2026-08-20T20:00:00.000Z",
          whyItMatters: "Tests the supplied revenue and margin baseline.",
          certainty: "confirmed",
        },
      ],
    };

    // When
    const checks = fallbackDecisionChecks("en", withEarnings, []);

    // Then
    expect(checks.map((candidate) => candidate.horizon)).toEqual([
      "today",
      "next_catalyst",
    ]);
  });

  it("suppresses a catalyst check when the next-report EPS forecast is absent", () => {
    // Given
    const eventWithoutForecast: BriefingSourceSnapshot = {
      ...snapshot,
      upcomingEvents: [
        {
          name: "Q2 earnings",
          scheduledAt: "2026-08-20T20:00:00.000Z",
          whyItMatters:
            "The report is dated but has no EPS decision threshold.",
          certainty: "confirmed",
        },
      ],
    };

    // When
    const checks = fallbackDecisionChecks("en", eventWithoutForecast, []);

    // Then
    expect(checks.map((candidate) => candidate.horizon)).toEqual(["today"]);
  });

  it("selects at most three evidence-backed lenses without ceremonial padding", () => {
    // Given
    const evidenceRich: BriefingSourceSnapshot = {
      ...snapshot,
      earnings: { nextEpsForecast: 1.2 },
      fundamentals: { revenue_one_year_growth_ttm: 0.25 },
    };
    const signals = [
      {
        id: "risk-1",
        kind: "risk" as const,
        direction: "negative" as const,
        title: "Regulatory review reported",
        detail: "A secondary report describes a new regulatory review.",
        investmentMeaning:
          "Primary confirmation is needed before sizing impact.",
        occurredAt: snapshot.cutoffAt,
      },
    ];

    // When
    const quietViews = fallbackAgentViews("en", snapshot, []);
    const richViews = fallbackAgentViews("en", evidenceRich, signals);

    // Then
    expect(quietViews.map((view) => view.agent)).toEqual(["market"]);
    expect(richViews).toHaveLength(3);
    expect(new Set(richViews.map((view) => view.agent)).size).toBe(3);
  });

  it("does not invent a 4h trend when technical evidence is absent", () => {
    // Given / When
    const views = fallbackAgentViews("en", snapshot, []);

    // Then
    expect(views[0]?.headline).not.toMatch(/4h|trend/iu);
    expect(views[0]?.detail).not.toMatch(/4h|trend/iu);
  });

  it("uses the next still-actionable close when a manual run occurs after the opening range", () => {
    const intraday: BriefingSourceSnapshot = {
      ...snapshot,
      cutoffAt: "2026-08-10T16:42:00.000Z",
      quote: { value: 180, changePercent: 1.2, marketState: "OPEN" },
      technicalReference: {
        timeframe: "4h",
        observedAt: "2026-08-10T16:00:00.000Z",
        barCount: 120,
        trend: "mixed",
        support: 176,
        resistance: 182,
      },
    };

    const [priceCheck] = fallbackDecisionChecks("ko", intraday, []);

    expect(priceCheck?.timing).toContain("13:30 ET");
    expect(priceCheck?.timing).not.toContain("개장 후 30분");
  });

  it("omits the generic operating-evidence ritual on a quiet day", () => {
    const checks = fallbackDecisionChecks("en", snapshot, []);

    expect(checks).toHaveLength(1);
  });

  it("does not promote a price-only decline into a second risk lens", () => {
    const priceOnly = [
      {
        id: "price:2026-08-11",
        kind: "price" as const,
        direction: "negative" as const,
        title: "Price declined",
        detail: "The observed price declined 2.1 percent.",
        investmentMeaning: "Price still requires an operating explanation.",
        occurredAt: snapshot.cutoffAt,
      },
    ];

    const views = fallbackAgentViews("en", snapshot, priceOnly);

    expect(views.map((view) => view.agent)).toEqual(["market"]);
  });

  it("writes an intraday quiet briefing with current price and still-actionable scenario levels", () => {
    const intraday: BriefingSourceSnapshot = {
      ...snapshot,
      symbol: "AAPL",
      company: "Apple Inc.",
      cutoffAt: "2026-08-10T17:25:45.088Z",
      quote: {
        value: 306.55,
        changePercent: -2.163852806944755,
        marketState: "OPEN",
      },
      marketReference: {
        previousClose: 313.33,
        previousHigh: 314.81,
        previousLow: 310.74,
      },
      technicalReference: {
        timeframe: "4h",
        observedAt: "2026-08-10T16:00:00.000Z",
        barCount: 120,
        trend: "bearish",
        support: 300.5,
        resistance: 316.29,
      },
      earnings: {
        nextReportAt: "2026-10-29T12:00:00.000Z",
        nextReportCertainty: "estimated",
        epsActual: 2.02,
        nextEpsForecast: 1.983827,
      },
      upcomingEvents: [
        {
          name: "AAPL earnings",
          scheduledAt: "2026-10-29T12:00:00.000Z",
          whyItMatters: "Tests revenue, margin, and guidance.",
          certainty: "estimated",
        },
      ],
    };

    const output = fallbackBriefingDraft({
      locale: "ko",
      snapshot: intraday,
      signals: [],
      previous: undefined,
    });

    expect(output.headline).toContain("10월 29일 예상 실적");
    expect(output.headline).not.toContain("개장");
    expect(output.summary).toContain(
      "현재 주가는 $306.55로 전일 종가 $313.33 대비 -2.16%",
    );
    expect(output.agentViews[0]?.headline).not.toContain("개장");
    expect(output.agentViews[1]?.detail).toContain("10월 29일(예상)");
    expect(output.bullCase).toContain(
      "상방 전제는 실적 기대 유지입니다. 가격 조건은 $310.74 회복입니다",
    );
    expect(output.bearCase).toContain(
      "하방 전제는 실적 기대 하향입니다. 가격 조건은 $300.50 이탈입니다",
    );

    const withinRange = fallbackBriefingDraft({
      locale: "ko",
      snapshot,
      signals: [],
      previous: undefined,
    });
    expect(withinRange.bullCase).toContain("$181.00 돌파 후 유지");
  });
});

describe("briefing draft repair", () => {
  it("recovers distinct views when the model repeats one lens", () => {
    // Given
    const repeated = {
      agent: "market" as const,
      stance: "watch" as const,
      headline: "Opening range confirmation",
      detail: "Price and volume must confirm the opening range after the open.",
    };
    const fallback = draft([
      {
        agent: "market",
        stance: "watch",
        headline: "Prior high test",
        detail:
          "Test the supplied prior high with stronger trading after the open.",
      },
      {
        agent: "risk",
        stance: "negative",
        headline: "Primary confirmation required",
        detail: "Do not size the reported risk before company confirmation.",
      },
    ]);

    // When
    const repaired = repairBriefingDraft(draft([repeated, repeated]), fallback);

    // Then
    expect(repaired.agentViews.length).toBeGreaterThanOrEqual(1);
    expect(new Set(repaired.agentViews.map((view) => view.agent)).size).toBe(
      repaired.agentViews.length,
    );
  });

  it("removes the internal cutoff field name from a visible check timing", () => {
    const localized = localizeBriefingDraft(
      "ko",
      {
        ...draft(fallbackAgentViews("ko", snapshot, [])),
        todayChecks: [{ ...check, timing: "cutoffAt 이후 정규장 마감 시" }],
      },
      "TSLA",
    );

    expect(localized.todayChecks[0]?.timing).toBe(
      "기준 시각 이후 정규장 마감 시",
    );
  });
});

describe("briefing edition assembly", () => {
  it("keeps only linked sources and preserves partial limitations", () => {
    // Given
    const sourceSnapshot: BriefingSourceSnapshot = {
      ...snapshot,
      limitations: ["Primary filing pending"],
      signals: [
        {
          id: "secondary-1",
          kind: "company",
          direction: "mixed",
          title: "Reported operating event",
          detail: "A secondary source reported an operating event.",
          investmentMeaning: "Company confirmation remains pending.",
          occurredAt: snapshot.cutoffAt,
          sourceUrl: "https://example.com/linked",
        },
      ],
      sources: [
        {
          title: "Linked report",
          publisher: "Example",
          publishedAt: snapshot.cutoffAt,
          url: "https://example.com/linked",
        },
        {
          title: "Unlinked report",
          publisher: "Example",
          publishedAt: snapshot.cutoffAt,
          url: "https://example.com/unlinked",
        },
      ],
    };
    const assembledDraft: BriefingDraft = {
      ...draft(fallbackAgentViews("en", snapshot, [])),
      materialChanges: [
        {
          id: "secondary-1",
          title: "Localized title",
          detail: "Localized evidence detail remains tied to its source.",
          investmentMeaning: "Primary confirmation remains required.",
        },
      ],
    };

    // When
    const edition = assembleBriefingEdition({
      locale: "en",
      snapshot: sourceSnapshot,
      generatedAt: snapshot.cutoffAt,
      signals: sourceSnapshot.signals,
      draft: assembledDraft,
      fallback: assembledDraft,
      modelFailed: false,
    });

    // Then
    expect(edition.sources.map((source) => source.url)).toEqual([
      "https://example.com/linked",
    ]);
    expect(edition.status).toBe("partial");
    expect(edition.limitations).toEqual(["Primary filing pending"]);
  });

  it("separates evidence completeness from fallback generation", () => {
    const assembledDraft = draft(fallbackAgentViews("en", snapshot, []));

    const edition = assembleBriefingEdition({
      locale: "en",
      snapshot,
      generatedAt: snapshot.cutoffAt,
      signals: snapshot.signals,
      draft: assembledDraft,
      fallback: assembledDraft,
      modelFailed: true,
    });

    expect(edition.status).toBe("ready");
    expect(edition.evidenceCompleteness).toBe("complete");
    expect(edition.generationMode).toBe("fallback");
  });

  it("retains estimated earnings catalysts and localizes limitation codes", () => {
    const estimated: BriefingSourceSnapshot = {
      ...snapshot,
      upcomingEvents: [
        {
          name: "NVDA earnings",
          scheduledAt: "2026-08-27T12:00:00.000Z",
          whyItMatters: "Tests revenue, margin, and forward guidance.",
          certainty: "estimated",
        },
      ],
      limitations: ["documents", "fundamentals"],
    };
    const assembledDraft = draft(fallbackAgentViews("ko", estimated, []));

    const edition = assembleBriefingEdition({
      locale: "ko",
      snapshot: estimated,
      generatedAt: snapshot.cutoffAt,
      signals: estimated.signals,
      draft: assembledDraft,
      fallback: assembledDraft,
      modelFailed: false,
    });

    expect(edition.upcomingEvents).toEqual([
      expect.objectContaining({ certainty: "estimated" }),
    ]);
    expect(edition.limitations).toEqual([
      "회사 공시·문서 수집 결과가 일부 누락됐습니다.",
      "핵심 재무 지표 수집 결과가 일부 누락됐습니다.",
    ]);
  });

  it("replaces a model catalyst check that is absent from source events", () => {
    const sourceEventSnapshot: BriefingSourceSnapshot = {
      ...snapshot,
      upcomingEvents: [
        {
          name: "NVDA earnings",
          scheduledAt: "2026-08-26T20:00:00.000Z",
          whyItMatters: "Tests revenue, margin, and forward guidance.",
          certainty: "estimated",
        },
      ],
    };
    const fallback = draft(fallbackAgentViews("en", sourceEventSnapshot, []));
    const modelDraft: BriefingDraft = {
      ...fallback,
      upcomingEvents: [
        {
          name: "Invented catalyst",
          scheduledAt: "2026-08-27T20:00:00.000Z",
          whyItMatters: "This date does not exist in the source snapshot.",
          certainty: "confirmed",
        },
      ],
      todayChecks: [
        {
          ...check,
          horizon: "next_catalyst",
          timing: "2026-08-27",
        },
      ],
    };

    const edition = assembleBriefingEdition({
      locale: "en",
      snapshot: sourceEventSnapshot,
      generatedAt: snapshot.cutoffAt,
      signals: [],
      draft: modelDraft,
      fallback,
      modelFailed: false,
    });

    expect(edition.todayChecks).toEqual([check]);
  });
});
