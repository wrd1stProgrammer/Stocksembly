import {
  CALL_BUDGET_POLICY,
  type CallBudgetFailureReason,
  type CallBudgetLedger,
  type CallBudgetSummary,
  type CallBudgetTransition,
  CreateLedgerSchema,
  LaunchRequestSchema,
  OutcomeRequestSchema,
} from "./callBudgetContracts";
import {
  WORKFLOW_V1_ROSTER_FINGERPRINT,
  WORKFLOW_V1_VERSION,
} from "./roleRegistry";
import {
  requiredArtifactSlotById,
  WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS,
} from "./roleRegistryArtifacts";

export type {
  CallBudgetFailureReason,
  CallBudgetLedger,
  CallBudgetSummary,
  CallBudgetTransition,
  LaunchOutcome,
  LaunchPurpose,
} from "./callBudgetContracts";
export { CALL_BUDGET_POLICY } from "./callBudgetContracts";

function incomplete(
  ledger: CallBudgetLedger,
  incompleteReason: CallBudgetFailureReason,
): CallBudgetTransition {
  return {
    kind: "incomplete",
    ledger: { ...ledger, status: "incomplete", incompleteReason },
  };
}

function appendLaunch(
  ledger: CallBudgetLedger,
  request: ReturnType<typeof LaunchRequestSchema.parse>,
): CallBudgetTransition {
  return {
    kind: "reserved",
    ledger: {
      ...ledger,
      launches: [...ledger.launches, { ...request, outcome: "reserved" }],
    },
  };
}

export function createCallBudgetLedger(input: unknown): CallBudgetLedger {
  const parsed = CreateLedgerSchema.parse(input);
  if (
    WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS.length !==
      CALL_BUDGET_POLICY.mandatoryFirstAttempts ||
    CALL_BUDGET_POLICY.initialCollectionAttempts +
      CALL_BUDGET_POLICY.mandatoryFirstAttempts +
      CALL_BUDGET_POLICY.maxOptionalFollowups +
      CALL_BUDGET_POLICY.maxRequiredReplacements !==
      CALL_BUDGET_POLICY.maxPhysicalLaunches
  ) {
    return {
      version: WORKFLOW_V1_VERSION,
      runId: parsed.runId,
      rosterFingerprint: parsed.rosterFingerprint,
      status: "incomplete",
      incompleteReason: "budget_drift",
      launches: [],
    };
  }
  if (parsed.rosterFingerprint !== WORKFLOW_V1_ROSTER_FINGERPRINT) {
    return {
      version: WORKFLOW_V1_VERSION,
      runId: parsed.runId,
      rosterFingerprint: parsed.rosterFingerprint,
      status: "incomplete",
      incompleteReason: "roster_drift",
      launches: [],
    };
  }
  return {
    version: WORKFLOW_V1_VERSION,
    runId: parsed.runId,
    rosterFingerprint: parsed.rosterFingerprint,
    status: "open",
    launches: [],
  };
}

export function summarizeCallBudget(
  ledger: CallBudgetLedger,
): CallBudgetSummary {
  const followups = ledger.launches.filter(
    (launch) => launch.purpose === "optional_followup",
  ).length;
  const replacements = ledger.launches.filter(
    (launch) => launch.purpose === "required_replacement",
  ).length;
  return {
    mandatoryFirstAttempts: CALL_BUDGET_POLICY.mandatoryFirstAttempts,
    followups,
    replacements,
    physicalLaunches:
      CALL_BUDGET_POLICY.initialCollectionAttempts +
      CALL_BUDGET_POLICY.mandatoryFirstAttempts +
      followups +
      replacements,
    burnedOrdinals: ledger.launches.length,
  };
}

export function allowedFollowups(ledger: CallBudgetLedger): number {
  const { replacements } = summarizeCallBudget(ledger);
  return Math.min(
    CALL_BUDGET_POLICY.maxOptionalFollowups,
    CALL_BUDGET_POLICY.maxPhysicalLaunches -
      CALL_BUDGET_POLICY.initialCollectionAttempts -
      CALL_BUDGET_POLICY.mandatoryFirstAttempts -
      replacements,
  );
}

export function reserveResearchLaunch(
  ledger: CallBudgetLedger,
  input: unknown,
): CallBudgetTransition {
  if (ledger.status === "incomplete") return { kind: "incomplete", ledger };
  if (ledger.rosterFingerprint !== WORKFLOW_V1_ROSTER_FINGERPRINT)
    return incomplete(ledger, "roster_drift");
  const request = LaunchRequestSchema.parse(input);
  if (request.rosterFingerprint !== WORKFLOW_V1_ROSTER_FINGERPRINT)
    return incomplete(ledger, "roster_drift");
  if (request.ordinal > CALL_BUDGET_POLICY.maxPhysicalLaunches)
    return incomplete(ledger, "ordinal_limit");
  if (ledger.launches.length >= CALL_BUDGET_POLICY.maxPhysicalLaunches)
    return incomplete(ledger, "physical_limit");
  if (ledger.launches.some((launch) => launch.ordinal === request.ordinal))
    return incomplete(ledger, "ordinal_reused");
  const last = ledger.launches.at(-1);
  if (last !== undefined && request.ordinal <= last.ordinal)
    return incomplete(ledger, "ordinal_not_monotonic");
  if (ledger.launches.some((launch) => launch.attemptId === request.attemptId))
    return incomplete(ledger, "attempt_reused");

  const summary = summarizeCallBudget(ledger);
  if (request.purpose === "mandatory_first") {
    if (requiredArtifactSlotById(request.logicalArtifactId) === undefined)
      return incomplete(ledger, "unknown_required_artifact");
    if (
      ledger.launches.some(
        (launch) =>
          launch.logicalArtifactId === request.logicalArtifactId &&
          launch.purpose === "mandatory_first",
      )
    )
      return incomplete(ledger, "mandatory_already_launched");
    return appendLaunch(ledger, request);
  }

  if (request.purpose === "optional_followup") {
    if (!request.logicalArtifactId.startsWith("followup:"))
      return incomplete(ledger, "invalid_optional_followup");
    if (
      ledger.launches.some(
        (launch) => launch.logicalArtifactId === request.logicalArtifactId,
      )
    )
      return incomplete(ledger, "optional_followup_reused");
    if (summary.followups >= allowedFollowups(ledger))
      return incomplete(ledger, "optional_followup_limit");
    if (summary.physicalLaunches >= CALL_BUDGET_POLICY.maxPhysicalLaunches)
      return incomplete(ledger, "physical_limit");
    return appendLaunch(ledger, request);
  }

  if (summary.physicalLaunches >= CALL_BUDGET_POLICY.maxPhysicalLaunches)
    return incomplete(ledger, "physical_limit");
  if (summary.replacements >= CALL_BUDGET_POLICY.maxRequiredReplacements)
    return incomplete(ledger, "replacement_limit");
  if (requiredArtifactSlotById(request.logicalArtifactId) === undefined)
    return incomplete(ledger, "replacement_not_required");
  const related = ledger.launches.filter(
    (launch) => launch.logicalArtifactId === request.logicalArtifactId,
  );
  if (
    related.filter((launch) => launch.purpose === "required_replacement")
      .length >=
    CALL_BUDGET_POLICY.maxAttemptsPerLogicalArtifact - 1
  )
    return incomplete(ledger, "replacement_already_used");
  const first = related.find((launch) => launch.purpose === "mandatory_first");
  const latest = related.at(-1);
  if (
    first === undefined ||
    latest === undefined ||
    latest.outcome === "reserved" ||
    latest.outcome === "accepted"
  )
    return incomplete(ledger, "replacement_not_needed");
  return appendLaunch(ledger, request);
}

export function recordResearchLaunchOutcome(
  ledger: CallBudgetLedger,
  input: unknown,
): CallBudgetTransition {
  if (ledger.status === "incomplete") return { kind: "incomplete", ledger };
  if (ledger.rosterFingerprint !== WORKFLOW_V1_ROSTER_FINGERPRINT)
    return incomplete(ledger, "roster_drift");
  const request = OutcomeRequestSchema.parse(input);
  const launch = ledger.launches.find(
    (candidate) => candidate.ordinal === request.ordinal,
  );
  if (launch === undefined) return incomplete(ledger, "unknown_launch");
  if (launch.outcome !== "reserved")
    return incomplete(ledger, "outcome_already_recorded");
  const recorded = {
    ...ledger,
    launches: ledger.launches.map((candidate) =>
      candidate.ordinal === request.ordinal
        ? { ...candidate, outcome: request.outcome }
        : candidate,
    ),
  };
  if (
    launch.purpose === "required_replacement" &&
    request.outcome !== "accepted" &&
    ledger.launches.filter(
      (candidate) =>
        candidate.logicalArtifactId === launch.logicalArtifactId &&
        candidate.purpose === "required_replacement",
    ).length >=
      CALL_BUDGET_POLICY.maxAttemptsPerLogicalArtifact - 1
  )
    return incomplete(recorded, "second_failed_required_launch");
  if (
    launch.purpose === "mandatory_first" &&
    request.outcome !== "accepted" &&
    summarizeCallBudget(recorded).replacements >=
      CALL_BUDGET_POLICY.maxRequiredReplacements
  )
    return incomplete(recorded, "replacement_capacity_exhausted");
  return { kind: "recorded", ledger: recorded };
}

export const WORKFLOW_V1_REQUIRED_FIRST_ATTEMPTS =
  WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS.length;
