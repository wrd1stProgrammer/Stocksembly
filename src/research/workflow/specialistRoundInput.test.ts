import { describe, expect, it } from "vitest";
import { assignAllAgents } from "../application/assignAllAgents";
import {
  makeAssignmentHarness,
  requireAssignments,
} from "../application/createMandate.testSupport";
import { specialistRequest } from "./specialistRoundInput";

describe("specialist request role routing", () => {
  it("gives June a technical-only machine-readable mandate", async () => {
    // Given
    const harness = await makeAssignmentHarness({ scope: "broad" });
    const assignments = requireAssignments(
      await assignAllAgents(harness.input, harness.repository),
    );
    const assignment = assignments.assignments.find(
      (candidate) => candidate.roleId === "market_news",
    );
    if (assignment === undefined) throw new TypeError("June fixture missing");

    // When
    const request = specialistRequest(
      {
        mandate: harness.input.mandate,
        snapshot: harness.snapshot,
        assignments,
      },
      assignment,
      { ordinal: 2, purpose: "mandatory_first" },
    );

    // Then
    expect(request.role.requiredOutputs).toEqual(
      expect.arrayContaining([
        "one_hour_entry_structure",
        "four_hour_medium_term_structure",
        "timeframe_agreement_or_disagreement",
        "invalidation_levels",
        "observed_coverage",
      ]),
    );
    expect(request.role.forbiddenOutputs).toEqual(
      expect.arrayContaining(["valuation_analysis", "news_summary"]),
    );
  });

  it("gives Sofia valuation inputs without a chart mandate", async () => {
    // Given
    const harness = await makeAssignmentHarness({ scope: "broad" });
    const assignments = requireAssignments(
      await assignAllAgents(harness.input, harness.repository),
    );
    const assignment = assignments.assignments.find(
      (candidate) => candidate.roleId === "valuation",
    );
    if (assignment === undefined) throw new TypeError("Sofia fixture missing");

    // When
    const request = specialistRequest(
      {
        mandate: harness.input.mandate,
        snapshot: harness.snapshot,
        assignments,
      },
      assignment,
      { ordinal: 7, purpose: "mandatory_first" },
    );

    // Then
    expect(request.role.requiredOutputs).toEqual(
      expect.arrayContaining([
        "valuation_multiples",
        "fundamental_sensitivity",
        "observed_coverage",
      ]),
    );
    expect(request.role.forbiddenOutputs).toEqual(
      expect.arrayContaining(["chart_technical_analysis", "news_summary"]),
    );
    expect(request.evidenceSlice.artifacts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dataset: "market_bars" }),
      ]),
    );
  });
});
