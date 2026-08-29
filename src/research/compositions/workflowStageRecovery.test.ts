import { describe, expect, it } from "vitest";
import {
  isRecoverableWorkflowFailure,
  workflowFailureDisposition,
} from "./workflowStageRecovery";

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

  it("does not start a second recovery loop after model replacements are exhausted", () => {
    expect(isRecoverableWorkflowFailure("replacement_exhausted")).toBe(false);
  });

  it("separates item omission and quality degradation without changing operational routing", () => {
    expect(workflowFailureDisposition("scenario_invalid")).toBe("item_omitted");
    expect(workflowFailureDisposition("editorial_v2_invalid:style_only")).toBe(
      "quality_degraded",
    );
    expect(workflowFailureDisposition("quality_failed:item_omitted")).toBe(
      "item_omitted",
    );
    expect(workflowFailureDisposition("quality_failed:local_style")).toBe(
      "quality_degraded",
    );
    expect(workflowFailureDisposition("provider_timeout")).toBe("retry");
    expect(workflowFailureDisposition("authentication_failed")).toBe(
      "terminalize",
    );
    expect(workflowFailureDisposition("replacement_exhausted")).toBe(
      "terminalize",
    );
  });

  it("reserves content no-charge failure for the three genuine blockers", () => {
    expect(workflowFailureDisposition("issuer_identity_unresolved")).toBe(
      "run_failed",
    );
    expect(workflowFailureDisposition("whole_envelope_integrity_failure")).toBe(
      "run_failed",
    );
    expect(workflowFailureDisposition("no_grounded_core_answer")).toBe(
      "run_failed",
    );
  });
});
