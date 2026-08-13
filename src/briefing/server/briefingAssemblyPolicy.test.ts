import { describe, expect, it } from "vitest";
import type {
  BriefingEditionPayload,
  BriefingSignal,
  BriefingSourceSnapshot,
} from "../domain/contracts";
import { assembleBriefingEdition } from "./briefingEditionAssembler";
import type { BriefingDraft } from "./briefingSynthesisSchema";

const signal: BriefingSignal = {
  id: "news:1",
  kind: "company",
  direction: "positive",
  title: "Issuer raises guidance",
  detail: "The issuer raised its source-backed revenue guidance.",
  investmentMeaning: "The revision changes the supplied revenue baseline.",
  occurredAt: "2026-08-11T12:00:00.000Z",
};

const snapshot: BriefingSourceSnapshot = {
  symbol: "AAPL",
  company: "Apple Inc.",
  providerCode: "NASDAQ:AAPL",
  marketDate: "2026-08-11",
  cutoffAt: "2026-08-11T14:00:00.000Z",
  coverageStart: "2026-08-11T13:00:00.000Z",
  quote: { value: 220 },
  signals: [signal],
  upcomingEvents: [],
  fundamentals: {},
  sources: [],
  limitations: [],
};

const previous: BriefingEditionPayload = {
  schemaVersion: 1,
  symbol: "AAPL",
  company: "Apple Inc.",
  locale: "en",
  marketDate: "2026-08-11",
  generatedAt: "2026-08-11T13:00:00.000Z",
  cutoffAt: "2026-08-11T13:00:00.000Z",
  coverageStart: "2026-08-10T13:00:00.000Z",
  status: "ready",
  attention: "low",
  headline: "Previous briefing",
  summary: "Previous briefing summary with sufficient source context.",
  price: { value: 219 },
  materialChanges: [],
  agentViews: [],
  bullCase: "Previous upside case.",
  bearCase: "Previous downside case.",
  upcomingEvents: [],
  todayChecks: [],
  sources: [],
  limitations: [],
};

function draft(
  materialChanges: BriefingDraft["materialChanges"],
): BriefingDraft {
  return {
    headline: "Current briefing headline",
    summary: "Current briefing summary with sufficient source-backed detail.",
    materialChanges,
    agentViews: [],
    bullCase: "Current source-backed upside case.",
    bearCase: "Current source-backed downside case.",
    upcomingEvents: [],
    todayChecks: [],
    changedSincePrevious: "The model claims an unsupported change occurred.",
    stillWatching: null,
  };
}

describe("briefing changed-since-previous assembly", () => {
  it("omits changedSincePrevious without material changes", () => {
    // Given
    const empty = draft([]);

    // When
    const edition = assembleBriefingEdition({
      locale: "en",
      snapshot,
      previous,
      generatedAt: snapshot.cutoffAt,
      signals: [],
      draft: empty,
      fallback: empty,
      modelFailed: false,
    });

    // Then
    expect(edition).not.toHaveProperty("changedSincePrevious");
  });

  it("derives changedSincePrevious from final source-backed changes", () => {
    // Given
    const sourceBacked = draft([
      {
        id: signal.id,
        title: signal.title,
        detail: signal.detail,
        investmentMeaning: signal.investmentMeaning,
      },
    ]);

    // When
    const edition = assembleBriefingEdition({
      locale: "en",
      snapshot,
      previous,
      generatedAt: snapshot.cutoffAt,
      signals: [signal],
      draft: sourceBacked,
      fallback: sourceBacked,
      modelFailed: false,
    });

    // Then
    expect(edition.changedSincePrevious).toBe(
      "1 new source-backed change versus the prior briefing.",
    );
    expect(edition.changedSincePrevious).not.toContain("unsupported");
  });

  it("uses evidence-native fallback cases instead of unprovable model cases", () => {
    // Given
    const fallback = draft([]);
    const model = {
      ...fallback,
      bullCase: "An unsupplied conversion KPI drives the upside case.",
      bearCase: "An unsupplied margin date drives the downside case.",
    };

    // When
    const edition = assembleBriefingEdition({
      locale: "en",
      snapshot,
      generatedAt: snapshot.cutoffAt,
      signals: [],
      draft: model,
      fallback,
      modelFailed: false,
    });

    // Then
    expect(edition.bullCase).toContain("$220.00");
    expect(edition.bearCase).toContain("$220.00");
    expect(edition.bullCase).not.toContain("conversion KPI");
    expect(edition.bearCase).not.toContain("margin date");
  });
});
