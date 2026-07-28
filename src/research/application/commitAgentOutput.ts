import { canonicalJson, hashCanonical } from "../domain/contractHelpers";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
} from "../domain/ids";
import { AgentOutputStageSchema } from "../domain/roleRegistry";
import {
  isArtifactStageOwner,
  requiredArtifactSlotById,
} from "../domain/roleRegistryArtifacts";
import type { AgentOutputCommitStorePort } from "../ports/agentOutputCommit";
import { type ArtifactCasPort, ArtifactDigestSchema } from "../ports/artifacts";
import {
  BindingSchema,
  committedEventType,
  FenceSchema,
  parseStagePayload,
  referencedArtifactIds,
  TRUSTED_AGENT_RUNTIME_POLICY,
  trustedAgentRuntime,
} from "./commitAgentOutputContracts";
import { verifyCitedParents } from "./commitAgentOutputParents";

type CommitAgentOutputCommand = {
  readonly claim: {
    readonly key: {
      readonly runId: unknown;
      readonly jobId: unknown;
      readonly attemptId: unknown;
      readonly ordinal: number;
    };
    readonly fence: { readonly ownerId: string; readonly token: number };
  };
  readonly stage: unknown;
  readonly candidate: unknown;
  readonly artifactId: unknown;
  readonly eventId: unknown;
  readonly replacementAttemptId: unknown;
  readonly replacementEventId: unknown;
  readonly occurredAt: string;
};

type CommitDependencies = {
  readonly cas: ArtifactCasPort;
  readonly store: AgentOutputCommitStorePort;
};

export async function commitAgentOutput(
  dependencies: CommitDependencies,
  command: CommitAgentOutputCommand,
) {
  const runId = RunIdSchema.safeParse(command.claim.key.runId);
  const jobId = JobIdSchema.safeParse(command.claim.key.jobId);
  const attemptId = AttemptIdSchema.safeParse(command.claim.key.attemptId);
  const fence = FenceSchema.safeParse(command.claim.fence);
  const stage = AgentOutputStageSchema.safeParse(command.stage);
  const artifactId = ArtifactIdSchema.safeParse(command.artifactId);
  const eventId = EventIdSchema.safeParse(command.eventId);
  if (
    !runId.success ||
    !jobId.success ||
    !attemptId.success ||
    !fence.success ||
    !stage.success ||
    !artifactId.success ||
    !eventId.success
  )
    return { kind: "rejected" } as const;
  const inspected = await dependencies.store.inspect({
    runId: runId.data,
    jobId: jobId.data,
    attemptId: attemptId.data,
    ordinal: command.claim.key.ordinal,
    ownerId: fence.data.ownerId,
    token: fence.data.token,
    now: command.occurredAt,
  });
  const stored = BindingSchema.safeParse(inspected);
  if (!stored.success) return { kind: "rejected" } as const;
  const binding = stored.data;
  const slot = requiredArtifactSlotById(binding.logicalArtifactId);
  const expectedRuntime = trustedAgentRuntime(
    stage.data,
    binding.logicalArtifactId,
  );
  if (
    binding.runId !== runId.data ||
    binding.jobId !== jobId.data ||
    binding.attemptId !== attemptId.data ||
    binding.ordinal !== command.claim.key.ordinal ||
    binding.currentFence.ownerId !== fence.data.ownerId ||
    binding.currentFence.token !== fence.data.token ||
    binding.jobInputManifestHash !== binding.attemptInputManifestHash ||
    binding.inputHash !== binding.runnerInputHash ||
    binding.runnerStage !== stage.data ||
    binding.runnerBinaryHash !== TRUSTED_AGENT_RUNTIME_POLICY.cliBinaryHash ||
    binding.runnerCliVersion !== TRUSTED_AGENT_RUNTIME_POLICY.cliVersion ||
    binding.runnerModel !== expectedRuntime.model ||
    binding.runnerReasoning !== expectedRuntime.reasoning ||
    binding.runnerBrowsingPolicy !==
      TRUSTED_AGENT_RUNTIME_POLICY.browsingByStage[stage.data] ||
    (binding.runnerBrowsingPolicy === "disabled" &&
      binding.runnerToolTranscriptHash !==
        TRUSTED_AGENT_RUNTIME_POLICY.emptyToolTranscriptHash) ||
    slot === undefined ||
    slot.stage !== stage.data ||
    !isArtifactStageOwner(stage.data, slot.ownerId)
  )
    return { kind: "rejected" } as const;
  const rejectMalformed = async (
    reason: "invalid_payload" | "invalid_citation" = "invalid_payload",
  ) => {
    const replacementAttemptId = AttemptIdSchema.safeParse(
      command.replacementAttemptId,
    );
    const replacementEventId = EventIdSchema.safeParse(
      command.replacementEventId,
    );
    if (!replacementAttemptId.success || !replacementEventId.success)
      return { kind: "rejected" } as const;
    return await dependencies.store.rejectMalformed({
      expected: binding,
      ownerId: fence.data.ownerId,
      token: fence.data.token,
      attemptId: binding.attemptId,
      burnedOrdinal: binding.ordinal,
      replacementAttemptId: replacementAttemptId.data,
      replacementEventId: replacementEventId.data,
      occurredAt: command.occurredAt,
      reason,
    });
  };
  const payload = parseStagePayload(stage.data, command.candidate);
  if (payload === undefined) return await rejectMalformed();
  const referenced = [...new Set(referencedArtifactIds(payload))];
  const allowedArtifactIds = binding.citableArtifacts.map(
    (artifact) => artifact.artifactId,
  );
  const allowedArtifactIdSet = new Set(allowedArtifactIds);
  const invalidArtifactIds = referenced.filter(
    (artifactId) => !allowedArtifactIdSet.has(artifactId),
  );
  if (invalidArtifactIds.length > 0) {
    const correction = await rejectMalformed("invalid_citation");
    if (correction.kind === "replacement_reserved")
      return {
        kind: "citation_replacement_reserved",
        ordinal: correction.ordinal,
        invalidArtifactIds,
        allowedArtifactIds,
      } as const;
    if (correction.kind === "incomplete")
      return {
        kind: "citation_incomplete",
        invalidArtifactIds,
        allowedArtifactIds,
      } as const;
    return correction;
  }
  const citations = await verifyCitedParents(
    dependencies.cas,
    binding,
    referenced,
  );
  if (citations === undefined) return { kind: "rejected" } as const;
  const envelope = {
    workflowVersion: "WorkflowV1",
    runId: binding.runId,
    snapshotId: binding.snapshotId,
    jobId: binding.jobId,
    attemptId: binding.attemptId,
    ordinal: binding.ordinal,
    logicalArtifactId: binding.logicalArtifactId,
    roleId: slot.ownerId,
    stage: stage.data,
    model: binding.runnerModel,
    reasoning: binding.runnerReasoning,
    browsingPolicy: binding.runnerBrowsingPolicy,
    toolTranscriptHash: binding.runnerToolTranscriptHash,
    cliVersion: TRUSTED_AGENT_RUNTIME_POLICY.cliVersion,
    cliBinaryHash: TRUSTED_AGENT_RUNTIME_POLICY.cliBinaryHash,
    promptHash: binding.promptHash,
    schemaHash: binding.schemaHash,
    inputHash: binding.inputHash,
    inputManifestHash: binding.attemptInputManifestHash,
    outputHash: hashCanonical(payload),
    citations,
    payload,
  } as const;
  const descriptor = await dependencies.cas.put({
    artifactId: artifactId.data,
    runId: binding.runId,
    snapshotId: binding.snapshotId,
    mediaType: "application/vnd.stocksembly.agent-output+json",
    parentDigests: citations.map((citation) =>
      ArtifactDigestSchema.parse(citation.contentHash),
    ),
    bytes: new TextEncoder().encode(canonicalJson(envelope)),
  });
  return await dependencies.store.commitAccepted({
    claim: fence.data,
    expected: binding,
    envelope,
    descriptor,
    parentArtifactIds: citations.map((citation) => citation.artifactId),
    event: {
      eventId: eventId.data,
      type: committedEventType(stage.data),
      runId: binding.runId,
      snapshotId: binding.snapshotId,
      jobId: binding.jobId,
      attemptId: binding.attemptId,
      artifactId: artifactId.data,
      logicalArtifactId: binding.logicalArtifactId,
      roleId: slot.ownerId,
      stage: stage.data,
      outputHash: envelope.outputHash,
      occurredAt: command.occurredAt,
    },
  });
}
