import { describe, expect, it } from "vitest";
import type { BriefingSourceSnapshot } from "../domain/contracts";
import { assembleBriefingEdition } from "./briefingEditionAssembler";
import { fallbackBriefingDraft } from "./briefingFallbackDraft";
import { fallbackAgentViews } from "./briefingFallbackViews";
import { buildBriefingFinancialContext } from "./briefingFinancialContext";

const cutoffAt = "2026-08-11T13:00:00.000Z";

function context(symbol: string, content: string) {
  return buildBriefingFinancialContext({
    symbol,
    documents: [
      {
        id: "company-presentation",
        category: "Slides",
        title: "Company presentation",
        reportedAt: "2025-12-31T00:00:00.000Z",
        publishedAt: "2026-02-15T14:00:00.000Z",
        content,
      },
      {
        id: "unrelated-transcript",
        category: "Event transcript",
        title: "Event transcript",
        reportedAt: "2026-02-16T00:00:00.000Z",
        publishedAt: "2026-02-16T14:00:00.000Z",
        content: "An unrelated call transcript mentioning cloud demand.",
      },
    ],
    cutoffAt,
  });
}

function snapshot(input: {
  readonly symbol: string;
  readonly company: string;
  readonly content: string;
  readonly nextEpsForecast?: number;
}): BriefingSourceSnapshot {
  const backgroundFinancialContext = context(input.symbol, input.content);
  return {
    symbol: input.symbol,
    company: input.company,
    providerCode: `NASDAQ:${input.symbol}`,
    marketDate: "2026-08-11",
    cutoffAt,
    coverageStart: "2026-08-10T13:00:00.000Z",
    quote: { value: 100, marketState: "PRE" },
    signals: [],
    upcomingEvents: [
      {
        name: `${input.symbol} earnings`,
        scheduledAt: "2026-10-20T20:00:00.000Z",
        whyItMatters: "Tests the next supplied operating evidence.",
        certainty: "estimated",
      },
    ],
    fundamentals: {},
    earnings: {
      epsActual: 5.2,
      epsForecast: 4.9,
      nextReportAt: "2026-10-20T20:00:00.000Z",
      ...(input.nextEpsForecast === undefined
        ? {}
        : { nextEpsForecast: input.nextEpsForecast }),
    },
    ...(backgroundFinancialContext === undefined
      ? {}
      : { backgroundFinancialContext }),
    sources: [],
    limitations: [],
  };
}

const genericHeader = `${"UNITED STATES SECURITIES AND EXCHANGE COMMISSION FORM 10-K ".repeat(12)}`;

describe("briefing company specificity policy", () => {
  it.each([
    [
      "AAPL",
      "Apple Inc.",
      "Services revenue and iPhone product mix",
      "services",
    ],
    [
      "NVDA",
      "NVIDIA Corporation",
      "Blackwell data center networking supply",
      "blackwell",
    ],
    ["TSLA", "Tesla, Inc.", "deliveries and energy storage", "deliveries"],
    [
      "MSFT",
      "Microsoft Corporation",
      "Azure intelligent cloud and capex",
      "azure",
    ],
    ["AMZN", "Amazon.com, Inc.", "AWS advertising and fulfillment", "aws"],
  ])(
    "routes supplied %s evidence into a company-specific view",
    (symbol, company, evidence, expected) => {
      const value = snapshot({
        symbol,
        company,
        content: `${genericHeader}${evidence} were discussed in the filed results.`,
      });
      const output = JSON.stringify(
        fallbackAgentViews("en", value, []),
      ).toLowerCase();

      expect(output).toContain(expected);
    },
  );

  it("surfaces two supplied bank-native metrics with safe Korean labels", () => {
    const value = snapshot({
      symbol: "JPM",
      company: "JPMorgan Chase & Co.",
      content: `${genericHeader}CET1 capital remained supplied while ROTCE and net interest income were reported.`,
    });
    const output = JSON.stringify(fallbackAgentViews("ko", value, []));

    expect(output).toContain("보통주자본비율(CET1)");
    expect(output).toContain("유형보통주자본이익률(ROTCE)");
  });

  it("repairs a model bank view that drops one of two supplied focuses", () => {
    const value = snapshot({
      symbol: "JPM",
      company: "JPMorgan Chase & Co.",
      content: `${genericHeader}CET1 capital remained supplied while ROTCE was reported.`,
    });
    const fallback = fallbackBriefingDraft({
      locale: "en",
      snapshot: value,
      signals: [],
      previous: undefined,
    });
    const model = {
      ...fallback,
      agentViews: [
        {
          agent: "financial" as const,
          stance: "watch" as const,
          headline: "Track CET1",
          detail: "Use the supplied CET1 evidence at the next report.",
        },
      ],
    };

    const edition = assembleBriefingEdition({
      locale: "en",
      snapshot: value,
      generatedAt: cutoffAt,
      signals: [],
      draft: model,
      fallback,
      modelFailed: false,
    });
    const output = JSON.stringify(edition.agentViews);

    expect(output).toContain("CET1");
    expect(output).toContain("ROTCE");
  });

  it("replaces a generic model financial view with supplied company evidence", () => {
    const value = snapshot({
      symbol: "AAPL",
      company: "Apple Inc.",
      content: `${genericHeader}Services revenue was the exact supplied operating focus.`,
    });
    const fallback = fallbackBriefingDraft({
      locale: "en",
      snapshot: value,
      signals: [],
      previous: undefined,
    });
    const model = {
      ...fallback,
      agentViews: [
        {
          agent: "market" as const,
          stance: "neutral" as const,
          headline: "Price remains within the supplied range",
          detail: "Observe the supplied price through the decision window.",
        },
        {
          agent: "financial" as const,
          stance: "watch" as const,
          headline: "Monitor the next report",
          detail: "Review the next report for a change in operating results.",
        },
      ],
    };

    const edition = assembleBriefingEdition({
      locale: "en",
      snapshot: value,
      generatedAt: cutoffAt,
      signals: [],
      draft: model,
      fallback,
      modelFailed: false,
    });
    const financial = edition.agentViews.find(
      (view) => view.agent === "financial",
    );

    expect(JSON.stringify(financial).toLowerCase()).toContain("services");
    expect(edition.agentViews).toHaveLength(2);
  });

  it("names exact focus and next-report EPS without comparing latest EPS", () => {
    const value = snapshot({
      symbol: "AMZN",
      company: "Amazon.com, Inc.",
      content: `${genericHeader}AWS demand was the exact supplied operating focus.`,
      nextEpsForecast: 2.08,
    });
    const fallback = fallbackBriefingDraft({
      locale: "en",
      snapshot: value,
      signals: [],
      previous: undefined,
    });
    const earningsEvent = fallback.upcomingEvents[0];
    const koreanFallback = fallbackBriefingDraft({
      locale: "ko",
      snapshot: value,
      signals: [],
      previous: undefined,
    });

    expect(earningsEvent?.whyItMatters.toLowerCase()).toContain("aws");
    expect(earningsEvent?.whyItMatters).toContain("2.08");
    expect(earningsEvent?.whyItMatters).not.toContain("5.20");
    expect(koreanFallback.upcomingEvents[0]?.whyItMatters).not.toMatch(
      /2\.08를/u,
    );
    expect(koreanFallback.upcomingEvents[0]?.whyItMatters).toBe(
      "실적 발표의 핵심 확인 항목: AWS · 다음 보고서 EPS 컨센서스 2.08. 회사 지표는 전년 동기 보고서의 같은 지표·기준 대비 개선·유지·약화로 판단하고, EPS는 해당 분기 컨센서스와 비교합니다.",
    );
    const financial = koreanFallback.agentViews.find(
      (view) => view.agent === "financial",
    );
    expect(financial?.detail).not.toMatch(/별도 보고서|2\.08를|전입액와/u);
    expect(financial?.detail.match(/\(예상\)/gu)).toHaveLength(1);
  });

  it("does not add company metrics when exact evidence is absent", () => {
    const value = snapshot({
      symbol: "TEST",
      company: "Test Corporation",
      content: `${genericHeader}The annual report was filed for the year.`,
    });
    const output = JSON.stringify(
      fallbackAgentViews("en", value, []),
    ).toLowerCase();

    expect(output).not.toMatch(
      /services|blackwell|azure|aws|cet1|rotce|deliveries|energy storage/iu,
    );
  });
});
