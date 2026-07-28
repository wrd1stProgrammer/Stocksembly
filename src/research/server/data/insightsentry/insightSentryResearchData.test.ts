import { describe } from "vitest";
import { registerInsightSentryBoundedDataCases } from "./insightSentryResearchBounded.testCases";
import { registerInsightSentryNewsClusteringCases } from "./insightSentryResearchNewsClustering.testCases";
import { registerInsightSentryFamilyStateCases } from "./insightSentryResearchStates.testCases";
import { registerInsightSentryValidationCases } from "./insightSentryResearchValidation.testCases";

describe("InsightSentry research data adapters", () => {
  registerInsightSentryBoundedDataCases();
  registerInsightSentryNewsClusteringCases();
  registerInsightSentryFamilyStateCases();
  registerInsightSentryValidationCases();
});
