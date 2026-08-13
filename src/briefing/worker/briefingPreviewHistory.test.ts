import { describe, expect, it } from "vitest";
import type { BriefingEditionPayload } from "../domain/contracts";
import {
  type BriefingPreviewEdition,
  selectBriefingPreviewHistory,
} from "./briefingPreviewHistory";

function edition(
  briefingId: string,
  marketDate: string,
  generatedAt: string,
): BriefingPreviewEdition {
  const payload: BriefingEditionPayload = {
    schemaVersion: 1,
    symbol: "AAPL",
    company: "Apple Inc.",
    locale: "ko",
    marketDate,
    generatedAt,
    cutoffAt: generatedAt,
    coverageStart: "2026-08-10T12:00:00.000Z",
    status: "ready",
    attention: "low",
    headline: "브리핑 제목",
    summary: "충분한 길이의 이전 브리핑 요약입니다.",
    price: { value: 220 },
    materialChanges: [],
    agentViews: [],
    bullCase: "이전 상승 조건입니다.",
    bearCase: "이전 하락 조건입니다.",
    upcomingEvents: [],
    todayChecks: [],
    sources: [],
    limitations: [],
  };
  return {
    briefingId,
    item: {
      symbol: "AAPL",
      providerCode: "NASDAQ:AAPL",
      company: "Apple Inc.",
      exchange: "NASDAQ",
      position: 0,
      createdAt: generatedAt,
    },
    payload,
  };
}

describe("local briefing preview history", () => {
  it("selects the immediate prior same-market-date edition", () => {
    // Given
    const current = edition(
      "building",
      "2026-08-11",
      "2026-08-11T15:00:00.000Z",
    );
    const sameDayPrior = edition(
      "same-day-prior",
      "2026-08-11",
      "2026-08-11T14:00:00.000Z",
    );
    const priorDay = edition(
      "prior-day",
      "2026-08-10",
      "2026-08-10T20:00:00.000Z",
    );

    // When
    const history = selectBriefingPreviewHistory(
      [priorDay, current, sameDayPrior],
      {
        symbol: "AAPL",
        locale: "ko",
        marketDate: "2026-08-11",
        excludedBriefingId: "building",
      },
    );

    // Then
    expect(history.map((candidate) => candidate.briefingId)).toEqual([
      "same-day-prior",
      "prior-day",
    ]);
    expect(history[0]?.payload).toBe(sameDayPrior.payload);
  });
});
