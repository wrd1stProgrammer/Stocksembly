import { expect, it } from "vitest";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { makeAuthoritativeReportInput } from "./assembleReport.testSupport";
import { normalizePublicationWording } from "./publicationWording";

it("normalizes public precision while preserving evidence lineage", () => {
  const canonical = ChairSynthesisOutputSchema.parse(
    makeAuthoritativeReportInput().chair,
  ).canonicalNarrativeV3;
  if (canonical === undefined) throw new Error("missing canonical fixture");
  const input = { ...canonical, decisiveReason: "Revenue rose 12.34567%." };
  const result = normalizePublicationWording(input);
  expect(result.changed).toBe(true);
  expect(result.canonical.decisiveReason).toBe("Revenue rose 12.35%.");
  expect(result.canonical.decisionLineage).toEqual(input.decisionLineage);
  expect(result.canonical.sections.map((section) => section.lineage)).toEqual(
    input.sections.map((section) => section.lineage),
  );
});
