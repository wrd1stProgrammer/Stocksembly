import { describe, expect, it } from "vitest";
import { mixedClaimValidationFixture } from "./chairSynthesis.testSupport";
import { ChairSynthesisPromptSchema } from "./chairSynthesisContracts";
import { chairSynthesisModelPrompt } from "./chairSynthesisPrompts";

describe("public research explanation mode", () => {
  it("routes easy mode only to the public explanation contract", () => {
    const { prompt } = mixedClaimValidationFixture();
    const easyPrompt = ChairSynthesisPromptSchema.parse({
      ...prompt,
      mandate: {
        ...prompt.mandate,
        researchProfile: {
          ...prompt.mandate.researchProfile,
          explanationMode: "easy",
        },
      },
    });

    const modelPrompt = JSON.parse(chairSynthesisModelPrompt(easyPrompt)) as {
      readonly publicSummaryContract: {
        readonly explanationPolicy: {
          readonly mode: string;
          readonly defineSpecializedTerms: boolean;
          readonly preserveAnalyticalDepth: boolean;
        };
      };
      readonly editorialDirection: { readonly explanationMode: string };
    };

    expect(modelPrompt.publicSummaryContract.explanationPolicy).toMatchObject({
      mode: "easy",
      defineSpecializedTerms: true,
      preserveAnalyticalDepth: true,
    });
    expect(modelPrompt.editorialDirection.explanationMode).toBe("easy");
  });
});
