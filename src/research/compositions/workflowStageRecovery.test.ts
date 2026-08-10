import { describe, expect, it } from "vitest";
import { isRecoverableWorkflowFailure } from "./workflowStageRecovery";

describe("workflow stage recovery classification", () => {
  it("does not retry deterministic publication contract mismatches", () => {
    expect(isRecoverableWorkflowFailure("chair_content_mismatch")).toBe(false);
    expect(isRecoverableWorkflowFailure("evidence_content_mismatch")).toBe(
      false,
    );
  });

  it("still retries transient runtime failures", () => {
    expect(isRecoverableWorkflowFailure("provider_timeout")).toBe(true);
  });
});
