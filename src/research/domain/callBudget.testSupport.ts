import {
  type CallBudgetLedger,
  createCallBudgetLedger,
  type LaunchOutcome,
  type LaunchPurpose,
  recordResearchLaunchOutcome,
  reserveResearchLaunch,
} from "./callBudget";
import { WORKFLOW_V1_ROSTER_FINGERPRINT } from "./roleRegistry";

export const TEST_RUN_ID = "00000000-0000-4000-8000-000000000001";

export const EXPECTED_REQUIRED_ARTIFACT_IDS = [
  "memo:market",
  "memo:market_news",
  "memo:benchmark",
  "memo:company",
  "memo:company_product",
  "memo:company_competition",
  "memo:financial",
  "memo:valuation",
  "memo:financial_quality",
  "memo:risk",
  "memo:risk_policy",
  "consolidation:market",
  "consolidation:company",
  "consolidation:financial",
  "consolidation:risk",
  "challenge:market",
  "challenge:company",
  "challenge:financial",
  "challenge:risk",
  "response_ballot:market",
  "response_ballot:company",
  "response_ballot:financial",
  "response_ballot:risk",
  "semantic_audit:system",
  "chair_synthesis:chair",
] as const;

const MIXED_FAILURES = [
  "invalid_schema",
  "process_crash",
  "timeout",
  "lost",
  "uncertain",
] as const;

export function attemptId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function openLedger(): CallBudgetLedger {
  return createCallBudgetLedger({
    runId: TEST_RUN_ID,
    rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
  });
}

export function reserve(
  ledger: CallBudgetLedger,
  ordinal: number,
  logicalArtifactId: string,
  purpose: LaunchPurpose,
): CallBudgetLedger {
  return reserveResearchLaunch(ledger, {
    ordinal,
    attemptId: attemptId(ordinal),
    logicalArtifactId,
    purpose,
    rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
  }).ledger;
}

export function outcome(
  ledger: CallBudgetLedger,
  ordinal: number,
  launchOutcome: LaunchOutcome,
): CallBudgetLedger {
  return recordResearchLaunchOutcome(ledger, {
    ordinal,
    outcome: launchOutcome,
  }).ledger;
}

export function completedSchedule(
  replacementCount: number,
  followupCount: number,
): CallBudgetLedger {
  let ledger = openLedger();
  let ordinal = 1;
  EXPECTED_REQUIRED_ARTIFACT_IDS.forEach((logicalArtifactId, index) => {
    ledger = reserve(ledger, ordinal, logicalArtifactId, "mandatory_first");
    if (index < replacementCount) {
      const failure = MIXED_FAILURES[index];
      if (failure !== undefined) ledger = outcome(ledger, ordinal, failure);
      ordinal += 1;
      ledger = reserve(
        ledger,
        ordinal,
        logicalArtifactId,
        "required_replacement",
      );
    }
    ledger = outcome(ledger, ordinal, "accepted");
    ordinal += 1;
  });
  for (let index = 0; index < followupCount; index += 1) {
    ledger = reserve(
      ledger,
      ordinal,
      `followup:generated-${index}`,
      "optional_followup",
    );
    ledger = outcome(ledger, ordinal, "accepted");
    ordinal += 1;
  }
  return ledger;
}
