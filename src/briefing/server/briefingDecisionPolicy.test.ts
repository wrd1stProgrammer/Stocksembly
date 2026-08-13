import { describe, expect, it } from "vitest";
import type { BriefingSourceSnapshot } from "../domain/contracts";
import { sourceBackedDecisionChecks } from "./briefingDecisionPolicy";
import { assembleBriefingEdition } from "./briefingEditionAssembler";
import { fallbackDecisionChecks } from "./briefingFallbackChecks";
import type { BriefingDraft } from "./briefingSynthesisSchema";

const snapshot: BriefingSourceSnapshot = {
  symbol: "TSLA",
  company: "Tesla, Inc.",
  providerCode: "NASDAQ:TSLA",
  marketDate: "2026-08-11",
  cutoffAt: "2026-08-11T14:00:00.000Z",
  coverageStart: "2026-08-11T12:00:00.000Z",
  quote: { value: 340, marketState: "REGULAR" },
  signals: [],
  upcomingEvents: [],
  fundamentals: {},
  marketReference: { previousHigh: 345, previousLow: 330 },
  sources: [],
  limitations: [],
};

const safeCheck: BriefingDraft["todayChecks"][number] = {
  horizon: "today",
  title: "Does price resolve the supplied range?",
  timing: "Regular-session close (16:00 ET)",
  metric: "Prior high $345.00 / prior low $330.00",
  confirmation: "The close is above $345.00.",
  ifConfirmed: "The upper supplied reference is confirmed.",
  ifUnclear: "A close from $330.00 through $345.00 leaves the test unclear.",
  ifFailed: "A close below $330.00 fails the price test.",
};

function draft(check: BriefingDraft["todayChecks"][number]): BriefingDraft {
  return {
    headline: "Source-backed decision fixture",
    summary:
      "This fixture distinguishes unsafe model branches from deterministic fallback output.",
    materialChanges: [],
    agentViews: [
      {
        agent: "market",
        stance: "watch",
        headline: "Price range",
        detail: "Use only supplied levels.",
      },
    ],
    bullCase: "Fallback upside uses the supplied upper reference.",
    bearCase: "Fallback downside uses the supplied lower reference.",
    upcomingEvents: [],
    todayChecks: [check],
    changedSincePrevious: null,
    stillWatching: null,
  };
}

describe("briefing decision policy", () => {
  it("replaces an overlapping single-threshold model today check", () => {
    // Given
    const aapl: BriefingSourceSnapshot = {
      ...snapshot,
      symbol: "AAPL",
      quote: { value: 298, marketState: "PRE" },
      marketReference: { previousHigh: 301.32, previousLow: 294.4 },
    };
    const fallback = fallbackDecisionChecks("en", aapl, []);
    const model = [
      {
        ...safeCheck,
        metric: "AAPL threshold $301.32",
        confirmation: "Price >= $301.32.",
        ifUnclear: "Price is around $301.32.",
        ifFailed: "Price < $301.32.",
      },
    ];

    // When
    const selected = sourceBackedDecisionChecks({
      snapshot: aapl,
      events: [],
      model,
      fallback,
    });

    // Then
    expect(selected).toEqual(fallback);
    expect(selected[0]?.confirmation).toContain("above $301.32");
    expect(selected[0]?.ifUnclear).toContain("$294.40 through $301.32");
    expect(selected[0]?.ifFailed).toContain("below $294.40");
  });

  it("partitions opening checks into exact upper middle and lower ranges", () => {
    // Given
    const fixtures = [
      {
        ...snapshot,
        symbol: "AAPL",
        cutoffAt: "2026-08-11T13:30:00.000Z",
        marketReference: { previousHigh: 225, previousLow: 215 },
      },
      {
        ...snapshot,
        symbol: "TSLA",
        cutoffAt: "2026-08-11T13:30:00.000Z",
        marketReference: { previousHigh: 345, previousLow: 330 },
        technicalReference: {
          timeframe: "4h",
          observedAt: "2026-08-11T12:00:00.000Z",
          barCount: 40,
          trend: "mixed",
          volumeRatio20: 1.4,
          support: 325,
          resistance: 350,
        },
      },
    ];

    for (const fixture of fixtures) {
      // When
      const [check] = fallbackDecisionChecks("en", fixture, []);
      const upper = fixture.marketReference.previousHigh.toFixed(2);
      const lower = fixture.marketReference.previousLow.toFixed(2);

      // Then
      expect(check?.confirmation).toContain(`above $${upper}`);
      expect(check?.ifUnclear).toContain(`$${lower} through $${upper}`);
      expect(check?.ifFailed).toContain(`below $${lower}`);
      expect(check?.confirmation).not.toContain("trading");
      expect(JSON.stringify(check)).not.toMatch(
        /supplied|provided|trading|거래 강도/iu,
      );
    }
  });

  it("replaces overlapping contradictory and unconfirmed branches", () => {
    // Given
    const unsafeChecks: readonly BriefingDraft["todayChecks"][number][] = [
      {
        ...safeCheck,
        confirmation: "Price is above $330.00.",
        ifFailed: "Price below $345.00 fails.",
      },
      {
        ...safeCheck,
        confirmation: "Revenue or margin improves.",
        ifConfirmed: "Both improve simultaneously.",
      },
      {
        ...safeCheck,
        confirmation: "Microsoft confirms demand.",
        ifFailed: "Without primary confirmation, the premise fails.",
      },
    ];

    for (const unsafe of unsafeChecks) {
      // When
      const edition = assembleBriefingEdition({
        locale: "en",
        snapshot,
        generatedAt: snapshot.cutoffAt,
        signals: [],
        draft: draft(unsafe),
        fallback: draft(safeCheck),
        modelFailed: false,
      });

      // Then
      expect(edition.todayChecks).toEqual([safeCheck]);
      expect(edition.bullCase).toContain("$345.00");
      expect(edition.bearCase).toContain("$330.00");
      expect(edition.bullCase).not.toContain("trading");
      expect(edition.bearCase).not.toContain("trading");
    }
  });

  it("rejects elapsed timing and unsupplied numeric evidence", () => {
    // Given
    const unsafe = {
      ...safeCheck,
      timing: "09:45 ET",
      metric: "Conversion KPI 999 on 2026-08-19",
    };

    // When
    const edition = assembleBriefingEdition({
      locale: "en",
      snapshot,
      generatedAt: snapshot.cutoffAt,
      signals: [],
      draft: draft(unsafe),
      fallback: draft(safeCheck),
      modelFailed: false,
    });

    // Then
    expect(edition.todayChecks).toEqual([safeCheck]);
  });
});
