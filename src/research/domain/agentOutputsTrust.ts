import { z } from "zod";
import {
  type AgentOutputCandidate,
  AgentOutputCandidateSchema,
} from "./agentOutputs";
import { CALL_BUDGET_POLICY } from "./callBudgetContracts";
import { hashCanonical } from "./contractHelpers";
import {
  type ArtifactId,
  ArtifactIdSchema,
  AttemptIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "./ids";
import {
  AGENT_OUTPUT_STAGES,
  WORKFLOW_V1_DEPARTMENT_IDS,
  WORKFLOW_V1_ROLE_REGISTRY,
  WORKFLOW_V1_SPECIALIST_IDS,
  WORKFLOW_V1_VERSION,
} from "./roleRegistry";
import {
  isArtifactStageOwner,
  requiredArtifactSlotById,
} from "./roleRegistryArtifacts";

const ActorIdSchema = z.enum([
  ...WORKFLOW_V1_SPECIALIST_IDS,
  "chair",
  "system",
]);

const SourceArtifactLineageSchema = z
  .object({
    artifactId: ArtifactIdSchema,
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
  })
  .strict()
  .readonly();

const TrustedLaunchMetadataSchema = z
  .object({
    workflowVersion: z.literal(WORKFLOW_V1_VERSION),
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    jobId: JobIdSchema,
    attemptId: AttemptIdSchema,
    launchOrdinal: z
      .number()
      .int()
      .positive()
      .max(CALL_BUDGET_POLICY.maxPhysicalLaunches),
    logicalArtifactId: z.string().regex(/^[a-z_]+:[a-z0-9_:-]+$/),
    artifactId: ArtifactIdSchema,
    stage: z.enum(AGENT_OUTPUT_STAGES),
    actorId: ActorIdSchema,
    departmentId: z.enum(WORKFLOW_V1_DEPARTMENT_IDS).nullable(),
    sourceArtifacts: z
      .array(SourceArtifactLineageSchema)
      .min(1)
      .max(64)
      .readonly(),
  })
  .strict()
  .readonly();

export type TrustedAgentLaunch = z.infer<typeof TrustedLaunchMetadataSchema>;
export type TrustedAgentOutput = TrustedAgentLaunch & {
  readonly outputHash: string;
  readonly payload: AgentOutputCandidate;
};

export type TrustedLaunchIssueResult =
  | { readonly kind: "issued"; readonly launch: TrustedAgentLaunch }
  | {
      readonly kind: "rejected";
      readonly reason:
        | "artifact_cycle"
        | "cross_run_lineage"
        | "cross_snapshot_lineage"
        | "duplicate_source_artifact"
        | "invalid_metadata"
        | "logical_artifact_mismatch"
        | "stage_owner_mismatch";
    };

export type AgentOutputAcceptanceResult =
  | { readonly kind: "accepted"; readonly output: TrustedAgentOutput }
  | {
      readonly kind: "rejected";
      readonly reason:
        | "invalid_payload"
        | "missing_source_lineage"
        | "stage_output_mismatch"
        | "untrusted_launch";
    };

const trustedLaunches = new WeakMap<object, TrustedAgentLaunch>();
const trustedOutputs = new WeakSet<object>();

export function issueTrustedAgentLaunch(
  input: unknown,
): TrustedLaunchIssueResult {
  const parsed = TrustedLaunchMetadataSchema.safeParse(input);
  if (!parsed.success) return { kind: "rejected", reason: "invalid_metadata" };
  const metadata = parsed.data;
  const sourceIds = metadata.sourceArtifacts.map((source) => source.artifactId);
  if (new Set(sourceIds).size !== sourceIds.length)
    return { kind: "rejected", reason: "duplicate_source_artifact" };
  if (sourceIds.some((sourceId) => sourceId === metadata.artifactId))
    return { kind: "rejected", reason: "artifact_cycle" };
  if (
    metadata.sourceArtifacts.some((source) => source.runId !== metadata.runId)
  )
    return { kind: "rejected", reason: "cross_run_lineage" };
  if (
    metadata.sourceArtifacts.some(
      (source) => source.snapshotId !== metadata.snapshotId,
    )
  )
    return { kind: "rejected", reason: "cross_snapshot_lineage" };

  if (metadata.stage === "follow_up") {
    const role = WORKFLOW_V1_ROLE_REGISTRY.roles.find(
      (candidate) => candidate.id === metadata.actorId,
    );
    if (
      role === undefined ||
      role.id === "chair" ||
      metadata.departmentId !== role.departmentId ||
      !metadata.logicalArtifactId.startsWith("followup:")
    )
      return { kind: "rejected", reason: "stage_owner_mismatch" };
  } else {
    const slot = requiredArtifactSlotById(metadata.logicalArtifactId);
    if (slot === undefined || slot.stage !== metadata.stage)
      return { kind: "rejected", reason: "logical_artifact_mismatch" };
    if (
      slot.ownerId !== metadata.actorId ||
      slot.departmentId !== metadata.departmentId
    )
      return { kind: "rejected", reason: "stage_owner_mismatch" };
  }
  if (!isArtifactStageOwner(metadata.stage, metadata.actorId))
    return { kind: "rejected", reason: "stage_owner_mismatch" };

  const launch = Object.freeze(metadata);
  trustedLaunches.set(launch, launch);
  return { kind: "issued", launch };
}

function referencedArtifactIds(
  payload: AgentOutputCandidate,
): readonly ArtifactId[] {
  switch (payload.kind) {
    case "memo":
      return [
        ...payload.sourceArtifactIds,
        ...payload.positions.flatMap(
          (position) => position.evidenceArtifactIds,
        ),
      ];
    case "department_consolidation":
      return payload.sourceArtifactIds;
    case "blind_challenge":
      return [...payload.sourceArtifactIds, ...payload.evidenceArtifactIds];
    case "owner_response_ballot":
      return payload.sourceArtifactIds;
    case "follow_up":
      return [...payload.sourceArtifactIds, ...payload.evidenceArtifactIds];
    case "semantic_audit":
      return [
        ...payload.sourceArtifactIds,
        ...payload.verdicts.flatMap((verdict) => verdict.evidenceArtifactIds),
      ];
    case "chair_synthesis":
      return [...payload.sourceArtifactIds, ...payload.ballotArtifactIds];
  }
}

export function acceptAgentOutput(
  launch: unknown,
  candidate: unknown,
): AgentOutputAcceptanceResult {
  if (typeof launch !== "object" || launch === null)
    return { kind: "rejected", reason: "untrusted_launch" };
  const trustedLaunch = trustedLaunches.get(launch);
  if (trustedLaunch === undefined)
    return { kind: "rejected", reason: "untrusted_launch" };
  const parsed = AgentOutputCandidateSchema.safeParse(candidate);
  if (!parsed.success) return { kind: "rejected", reason: "invalid_payload" };
  const payload = parsed.data;
  if (payload.kind !== trustedLaunch.stage)
    return { kind: "rejected", reason: "stage_output_mismatch" };
  const sourceIds = new Set(
    trustedLaunch.sourceArtifacts.map((source) => source.artifactId),
  );
  if (referencedArtifactIds(payload).some((id) => !sourceIds.has(id)))
    return { kind: "rejected", reason: "missing_source_lineage" };
  const output = Object.freeze({
    ...trustedLaunch,
    outputHash: hashCanonical(payload),
    payload,
  });
  trustedOutputs.add(output);
  return { kind: "accepted", output };
}

export function isTrustedAgentOutput(
  value: unknown,
): value is TrustedAgentOutput {
  return (
    typeof value === "object" && value !== null && trustedOutputs.has(value)
  );
}
