import { describe, expect, it } from "vitest";
import { TickerSymbolSchema } from "./ids";
import {
  analyticalResearchProfile,
  DEFAULT_RESEARCH_PROFILE,
  inferQuestionComparisonSymbols,
  normalizeResearchProfile,
  publicExplanationPolicy,
  withQuestionComparisonSymbols,
  withQuestionIntent,
} from "./researchProfile";

describe("research profile question comparators", () => {
  it("recovers a Korean phonetic NVIDIA mention from an AMD choice question", () => {
    expect(
      inferQuestionComparisonSymbols(
        "암드 살 바에 앤디비아 사는 게 맞으려나?",
        "AMD",
      ),
    ).toEqual(["NVDA"]);
  });

  it("keeps explicit comparators and excludes the subject", () => {
    expect(
      withQuestionComparisonSymbols(
        {
          ...DEFAULT_RESEARCH_PROFILE,
          comparisonSymbols: [TickerSymbolSchema.parse("AVGO")],
        },
        "NVIDIA와 AMD 중 장기 투자엔 누가 낫나?",
        "AMD",
      ).comparisonSymbols,
    ).toEqual(["AVGO", "NVDA"]);
  });
});

describe("research explanation mode", () => {
  it("normalizes legacy profiles to the professional explanation mode", () => {
    const { explanationMode, ...legacyProfile } = DEFAULT_RESEARCH_PROFILE;
    expect(explanationMode).toBe("professional");

    expect(normalizeResearchProfile(legacyProfile).explanationMode).toBe(
      "professional",
    );
  });

  it("keeps analytical inputs identical while changing only public explanation", () => {
    const easy = {
      ...DEFAULT_RESEARCH_PROFILE,
      explanationMode: "easy",
    } as const;
    const professional = {
      ...DEFAULT_RESEARCH_PROFILE,
      explanationMode: "professional",
    } as const;

    expect(analyticalResearchProfile(easy)).toEqual(
      analyticalResearchProfile(professional),
    );
    expect(publicExplanationPolicy(easy)).toMatchObject({
      mode: "easy",
      defineSpecializedTerms: true,
      preserveAnalyticalDepth: true,
    });
  });
});

describe("research question intent", () => {
  it("recovers long-term position sizing from a question with default controls", () => {
    expect(
      withQuestionIntent(
        DEFAULT_RESEARCH_PROFILE,
        "사이버캡 이슈로 올랐던데 물량 더 가져갈까 장기적으로?",
      ),
    ).toMatchObject({
      investmentHorizon: "long",
      decisionPurpose: "position_sizing",
    });
  });
  it("preserves nondefault controls and does not guess an ambiguous horizon", () => {
    expect(
      withQuestionIntent(
        {
          ...DEFAULT_RESEARCH_PROFILE,
          investmentHorizon: "short",
          decisionPurpose: "earnings",
        },
        "장기 보유 비중",
      ),
    ).toMatchObject({
      investmentHorizon: "short",
      decisionPurpose: "earnings",
    });
    expect(
      withQuestionIntent(DEFAULT_RESEARCH_PROFILE, "단기와 장기 전망")
        .investmentHorizon,
    ).toBe("medium");
  });
});
