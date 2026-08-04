import {
  hashCanonical,
  isSha256,
  timestampMillis,
} from "../domain/contractHelpers";
import { DEFAULT_RESEARCH_PROFILE } from "../domain/researchProfile";
import { evaluateModelTransfer } from "../domain/rights";
import {
  WORKFLOW_V1_ROSTER_FINGERPRINT,
  WORKFLOW_V1_SPECIALIST_IDS,
} from "../domain/roleRegistry";
import type {
  AllAgentAssignmentsV1,
  AssignAllAgentsInput,
  AssignmentRepositoryPort,
  ChairAssignmentV1,
  MandateSealedEvent,
  SpecialistAssignmentV1,
} from "./assignAllAgentsContracts";
import {
  ROLE_ASSIGNMENT_POLICIES,
  type RoleAssignmentPolicy,
} from "./assignAllAgentsPolicy";
import { freezeDeep } from "./createMandateImmutable";

export type {
  AllAgentAssignmentsV1,
  AssignAllAgentsInput,
  AssignmentRepositoryPort,
} from "./assignAllAgentsContracts";

export class AssignmentAdmissionError extends Error {
  readonly name = "AssignmentAdmissionError";

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: string, message: string): never {
  throw new AssignmentAdmissionError(code, message);
}

function sameValues(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function validateAdmission(input: AssignAllAgentsInput): void {
  if (!sameValues(input.rosterIds, WORKFLOW_V1_SPECIALIST_IDS))
    fail("specialist_roster_drift", "all exact specialist roles are required");
  if (!sameValues(input.mandate.specialistRoleIds, WORKFLOW_V1_SPECIALIST_IDS))
    fail("mandate_roster_drift", "mandate specialist roster is invalid");
  if (
    input.mandate.chairRoleId !== "chair" ||
    input.mandate.rosterFingerprint !== WORKFLOW_V1_ROSTER_FINGERPRINT
  )
    fail("chair_roster_drift", "chair must remain separate from specialists");
  if (
    input.mandate.runId !== input.snapshot.runId ||
    input.mandate.snapshotId !== input.snapshot.snapshotId ||
    input.mandate.manifestHash !== input.snapshot.manifestHash
  )
    fail("cross_snapshot", "mandate and snapshot lineage must match");
  const { mandateHash, ...mandateBody } = input.mandate;
  if (hashCanonical(mandateBody) !== mandateHash)
    fail("mandate_hash_mismatch", "mandate is not immutable");
  const { manifestHash, ...snapshotBody } = input.snapshot;
  if (hashCanonical(snapshotBody) !== manifestHash)
    fail("snapshot_hash_mismatch", "snapshot is not immutable");
  if (
    timestampMillis(input.mandate.mandateSealedAt) <
    timestampMillis(input.snapshot.snapshotSealedAt)
  )
    fail("mandate_before_snapshot", "mandate precedes snapshot");
  const allowedSources = new Set(
    input.snapshot.rights
      .filter((item) => item.decision === "allowed")
      .map((item) => item.source),
  );
  for (const artifact of input.snapshot.artifacts) {
    if (
      !allowedSources.has(artifact.rightsSource) ||
      evaluateModelTransfer(artifact.rightsSource).kind !== "allowed"
    )
      fail("unsealed_evidence", "artifact lacks sealed model-transfer rights");
    if (
      !isSha256(artifact.rawHash) ||
      (artifact.normalizedHash !== undefined &&
        !isSha256(artifact.normalizedHash)) ||
      timestampMillis(artifact.retrievedAt) >
        timestampMillis(input.snapshot.evidenceCutoffAt)
    )
      fail("unsealed_evidence", "artifact is outside the sealed evidence set");
  }
  if (
    input.snapshot.valueRegistry.runId !== input.snapshot.runId ||
    input.snapshot.valueRegistry.snapshotId !== input.snapshot.snapshotId
  )
    fail("cross_snapshot", "value registry crosses snapshot lineage");
}

function assignmentFor(
  input: AssignAllAgentsInput,
  policy: RoleAssignmentPolicy,
): SpecialistAssignmentV1 {
  const isActive =
    input.mandate.scope === "broad" ||
    input.mandate.materialCruxes.includes(policy.primaryCrux);
  const allowedDatasets = [
    ...policy.allowedDatasets,
    ...((input.mandate.researchProfile ?? DEFAULT_RESEARCH_PROFILE)
      .decisionPurpose === "earnings" &&
    ["financial", "valuation", "financial_quality"].includes(policy.roleId)
      ? (["insightsentry_calendar"] as const)
      : []),
    "insightsentry_request_ledger" as const,
  ];
  const artifacts = structuredClone(
    isActive
      ? input.snapshot.artifacts.filter(
          (artifact) =>
            allowedDatasets.includes(artifact.dataset) &&
            policy.allowedRightsSources.includes(artifact.rightsSource),
        )
      : [],
  );
  const capabilities = structuredClone(
    input.snapshot.capabilities.disclosures.filter((item) =>
      policy.capabilityKeys.includes(item.key),
    ),
  );
  const sliceBody = {
    runId: input.snapshot.runId,
    snapshotId: input.snapshot.snapshotId,
    manifestHash: input.snapshot.manifestHash,
    mandateHash: input.mandate.mandateHash,
    roleId: policy.roleId,
    artifacts,
    capabilities,
  };
  const evidenceSlice = {
    ...sliceBody,
    sliceHash: hashCanonical(sliceBody),
  };
  const body = structuredClone({
    roleId: policy.roleId,
    agentName: policy.agentName,
    ...(input.mandate.question === undefined
      ? {}
      : { question: input.mandate.question }),
    scope: input.mandate.scope,
    focusAreas: [...policy.focusAreas],
    activeCruxes: input.mandate.materialCruxes.filter(
      (crux) => crux === policy.primaryCrux,
    ),
    allowedDatasets,
    allowedRightsSources: [...policy.allowedRightsSources],
    capabilityKeys: [...policy.capabilityKeys],
    requiredOutputs: [
      ...new Set([
        ...policy.requiredOutputs,
        "base_hypothesis",
        "competing_hypothesis",
        "disconfirming_evidence",
      ]),
    ],
    forbiddenOutputs: [...policy.forbiddenOutputs],
    limitations: input.mandate.limitations,
    evidenceSlice,
  });
  return freezeDeep({ ...body, assignmentHash: hashCanonical(body) });
}

export async function assignAllAgents(
  input: AssignAllAgentsInput,
  repository: AssignmentRepositoryPort,
): Promise<AllAgentAssignmentsV1> {
  validateAdmission(input);
  const assignments = ROLE_ASSIGNMENT_POLICIES.map((policy) =>
    assignmentFor(input, policy),
  );
  if (
    assignments.length !== WORKFLOW_V1_SPECIALIST_IDS.length ||
    new Set(assignments.map((item) => item.roleId)).size !==
      WORKFLOW_V1_SPECIALIST_IDS.length
  )
    fail("assignment_roster_invalid", "every specialist must be assigned once");
  const chairBody = {
    roleId: "chair",
    name: "Dr. Park",
    mandateHash: input.mandate.mandateHash,
    snapshotId: input.snapshot.snapshotId,
    permittedStage: "chair_synthesis",
  } as const;
  const chair: ChairAssignmentV1 = freezeDeep({
    ...chairBody,
    assignmentHash: hashCanonical(chairBody),
  });
  const resultBody = {
    mandateHash: input.mandate.mandateHash,
    assignments,
    chair,
  };
  const result = freezeDeep({
    ...resultBody,
    assignmentsHash: hashCanonical(resultBody),
  });
  const event: MandateSealedEvent = freezeDeep({
    kind: "mandate_sealed",
    runId: input.mandate.runId,
    snapshotId: input.mandate.snapshotId,
    mandateHash: input.mandate.mandateHash,
    at: input.mandate.mandateSealedAt,
    author: "system",
  });
  await repository.transaction(async (transaction) => {
    await transaction.persistMandate(input.mandate);
    await transaction.persistAssignments(assignments);
    await transaction.persistChair(chair);
    await transaction.appendMandateSealedEvent(event);
  });
  return result;
}
