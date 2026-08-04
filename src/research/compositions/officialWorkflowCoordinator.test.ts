import { describe, expect, it } from "vitest";
import {
  semanticAuditCoordinatorAction,
  workflowFailureCode,
} from "./officialWorkflowCoordinator";

describe("official workflow coordinator", () => {
  it("continues after an accepted publishable semantic audit", () => {
    expect(
      semanticAuditCoordinatorAction({
        artifactIds: ["audit-artifact"],
        blockers: [],
        incompleteReason: null,
        publishable: true,
      }),
    ).toBe("advance");
  });

  it("stages a semantic audit only while no accepted result exists", () => {
    expect(
      semanticAuditCoordinatorAction({
        artifactIds: [],
        blockers: [],
        incompleteReason: "semantic_artifact_missing",
        publishable: false,
      }),
    ).toBe("stage");
  });

  it("terminalizes an accepted semantic audit with publication blockers", () => {
    expect(
      semanticAuditCoordinatorAction({
        artifactIds: ["audit-artifact"],
        blockers: ["material_claim_contradicted:claim-1"],
        incompleteReason: null,
        publishable: false,
      }),
    ).toBe("terminalize");
  });

  it("preserves a stable editorial terminal code without generic retry exhaustion", () => {
    expect(
      workflowFailureCode(
        "report_publication",
        "editorial_quality_failed:unsupported_number",
      ),
    ).toBe("editorial_quality_failed:unsupported_number");
  });
});
