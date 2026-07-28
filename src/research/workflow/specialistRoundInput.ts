import type { SpecialistAssignmentV1 } from "../application/assignAllAgentsContracts";
import { hashCanonical } from "../domain/contractHelpers";
import {
  AttemptIdSchema,
  ClaimIdSchema,
  JobIdSchema,
  QuestionIdSchema,
} from "../domain/ids";
import {
  type SpecialistRoleId,
  WORKFLOW_V1_SPECIALIST_IDS,
  workflowRoleById,
} from "../domain/roleRegistry";
import type { ValueRecord } from "../domain/valueRegistry";
import type {
  SpecialistJobRequest,
  SpecialistMemoCandidate,
  SpecialistRoundInput,
} from "./specialistRoundContracts";
import { SpecialistMemoCandidateSchema } from "./specialistRoundContracts";

const TRADE_INSTRUCTION =
  /\b(?:buy|sell|hold|long|short)\b|(?:매수|매도|보유|롱|숏)/iu;
const PRICE_MENTION =
  /(?:[$€£¥₩]|\b(?:price|price target|current price|multiple)\b|(?:가격|주가|목표가|배수))/iu;
const PRICE_ENABLED_ROLES = new Set<SpecialistRoleId>([
  "market_news",
  "benchmark",
  "valuation",
]);

function deterministicUuid(seed: unknown): string {
  const hash = hashCanonical(seed);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function registeredValuesFor(
  assignment: SpecialistAssignmentV1,
  values: readonly ValueRecord[],
): readonly ValueRecord[] {
  const counts = new Map<string, number>();
  const selected: ValueRecord[] = [];
  for (const value of [...values].reverse()) {
    if (
      !assignment.allowedRightsSources.some(
        (source) => source === value.source,
      ) ||
      (counts.get(value.metric) ?? 0) >= 6
    )
      continue;
    counts.set(value.metric, (counts.get(value.metric) ?? 0) + 1);
    selected.push(value);
  }
  return selected.reverse();
}

export function specialistRequest(
  input: SpecialistRoundInput,
  assignment: SpecialistAssignmentV1,
  attempt: {
    readonly ordinal: number;
    readonly purpose: "mandatory_first" | "required_replacement";
  },
): SpecialistJobRequest {
  const role = workflowRoleById(assignment.roleId);
  if (role === undefined || role.id === "chair")
    throw new TypeError("specialist assignment role is unavailable");
  const identity = {
    runId: input.mandate.runId,
    roleId: role.id,
    ordinal: attempt.ordinal,
  };
  return {
    promptName: `specialist_memo_prompt_v1:${role.id}`,
    schemaName: `specialist_memo_v1:${role.id}`,
    snapshotId: input.snapshot.snapshotId,
    evidenceCutoffAt: input.snapshot.evidenceCutoffAt,
    role: {
      id: role.id,
      name: role.name,
      focusAreas: assignment.focusAreas,
      evidenceNeeds: role.evidenceNeeds,
      requiredOutputs: assignment.requiredOutputs,
      forbiddenOutputs: assignment.forbiddenOutputs,
    },
    mandate: {
      mandateHash: input.mandate.mandateHash,
      ...(input.mandate.question === undefined
        ? {}
        : { question: input.mandate.question }),
      scope: input.mandate.scope,
      locale: input.mandate.locale,
      limitations: input.mandate.limitations,
    },
    capabilityStatement: assignment.evidenceSlice.capabilities,
    evidenceSlice: assignment.evidenceSlice,
    registeredValues: registeredValuesFor(
      assignment,
      input.snapshot.valueRegistry.records,
    ),
    attempt: {
      jobId: JobIdSchema.parse(deterministicUuid({ ...identity, kind: "job" })),
      attemptId: AttemptIdSchema.parse(
        deterministicUuid({ ...identity, kind: "attempt" }),
      ),
      ordinal: attempt.ordinal,
      purpose: attempt.purpose,
    },
    ids: {
      claimId: ClaimIdSchema.parse(
        deterministicUuid({ ...identity, kind: "claim" }),
      ),
      questionId: QuestionIdSchema.parse(
        deterministicUuid({ ...identity, kind: "question" }),
      ),
    },
  };
}

export type CandidateInspection =
  | {
      readonly kind: "accepted";
      readonly candidate: SpecialistMemoCandidate;
      readonly publicFingerprint: string;
    }
  | { readonly kind: "invalid" };

export function inspectSpecialistCandidate(
  request: SpecialistJobRequest,
  output: string,
  existingPublicFingerprints: ReadonlySet<string>,
): CandidateInspection {
  let decoded: unknown;
  try {
    decoded = JSON.parse(output);
  } catch (error) {
    if (error instanceof SyntaxError) return { kind: "invalid" };
    throw error;
  }
  const parsed = SpecialistMemoCandidateSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.roleId !== request.role.id)
    return { kind: "invalid" };
  const candidate = parsed.data;
  const serialized = JSON.stringify(candidate);
  const hasMarketData = request.capabilityStatement.some(
    (capability) =>
      capability.key === "current_market_data" &&
      capability.state.availability === "available",
  );
  if (
    TRADE_INSTRUCTION.test(serialized) ||
    (PRICE_MENTION.test(serialized) &&
      (!PRICE_ENABLED_ROLES.has(request.role.id) || !hasMarketData))
  )
    return { kind: "invalid" };
  const evidenceHashes = new Map(
    request.evidenceSlice.artifacts.map((artifact) => [
      artifact.evidenceId,
      artifact.normalizedHash ?? artifact.rawHash,
    ]),
  );
  const evidenceRefs = [
    ...candidate.claims.flatMap((claim) => claim.evidenceRefs),
    ...candidate.opposingEvidence.flatMap((item) => item.evidenceRefs),
  ];
  if (
    evidenceRefs.some(
      (reference) =>
        evidenceHashes.get(reference.evidenceId) !== reference.contentHash,
    )
  )
    return { kind: "invalid" };
  const registeredValueIds = new Set(
    request.registeredValues.map((value) => value.valueId),
  );
  if (
    candidate.claims.some((claim) =>
      claim.calculationValueIds.some((id) => !registeredValueIds.has(id)),
    ) ||
    candidate.followUpProposals.some(
      (proposal) => !request.role.evidenceNeeds.includes(proposal.evidenceNeed),
    )
  )
    return { kind: "invalid" };
  const publicFingerprint = hashCanonical(candidate.publicSummary);
  if (existingPublicFingerprints.has(publicFingerprint))
    return { kind: "invalid" };
  return { kind: "accepted", candidate, publicFingerprint };
}

export function validateSpecialistRoundInput(
  input: SpecialistRoundInput,
): readonly SpecialistAssignmentV1[] | undefined {
  if (
    input.snapshot.runId !== input.mandate.runId ||
    input.snapshot.snapshotId !== input.mandate.snapshotId ||
    input.snapshot.manifestHash !== input.mandate.manifestHash ||
    input.assignments.mandateHash !== input.mandate.mandateHash
  )
    return undefined;
  const assignments = input.assignments.assignments;
  if (assignments.length !== WORKFLOW_V1_SPECIALIST_IDS.length)
    return undefined;
  const roleIds = new Set<SpecialistRoleId>();
  for (const assignment of assignments) {
    const { sliceHash: _sliceHash, ...sliceBody } = assignment.evidenceSlice;
    if (
      roleIds.has(assignment.roleId) ||
      assignment.evidenceSlice.roleId !== assignment.roleId ||
      assignment.evidenceSlice.snapshotId !== input.snapshot.snapshotId ||
      assignment.evidenceSlice.manifestHash !== input.snapshot.manifestHash ||
      assignment.evidenceSlice.mandateHash !== input.mandate.mandateHash ||
      hashCanonical(sliceBody) !== assignment.evidenceSlice.sliceHash
    )
      return undefined;
    roleIds.add(assignment.roleId);
  }
  return assignments;
}
