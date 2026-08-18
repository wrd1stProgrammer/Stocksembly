import { describe, expect, it } from "vitest";
import { TickerSymbolSchema } from "./ids";
import {
  analyticalResearchProfile,
  DEFAULT_RESEARCH_PROFILE,
  inferQuestionComparisonSymbols,
  normalizeResearchProfile,
  publicExplanationPolicy,
  withQuestionComparisonSymbols,
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
