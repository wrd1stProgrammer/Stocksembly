import { z } from "zod";
import { AgentOutputCandidateSchema } from "../domain/agentOutputs";
import { BilingualPublicTextSchema } from "../domain/agentOutputsShared";
import { hashBytes, hashCanonical } from "../domain/contractHelpers";
import {
  type ArtifactIdSchema,
  type ClaimIdSchema,
  QuestionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import { AgentOutputStageSchema } from "../domain/roleRegistry";
import { requiredArtifactSlotById } from "../domain/roleRegistryArtifacts";
import type { ArtifactCasPort, ArtifactDigestSchema } from "../ports/artifacts";

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

const ParentEnvelopeSchema = z
  .object({
    workflowVersion: z.literal("WorkflowV1"),
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    logicalArtifactId: z.string().min(1),
    roleId: z.string().min(1),
    stage: AgentOutputStageSchema,
    outputHash: HashSchema,
    payload: AgentOutputCandidateSchema,
  })
  .passthrough();

export type WorkflowParentReference = {
  readonly artifactId: z.infer<typeof ArtifactIdSchema>;
  readonly logicalArtifactKey: string;
  readonly contentHash: z.infer<typeof ArtifactDigestSchema>;
};

export type WorkflowOpenQuestion = {
  readonly questionId: z.infer<typeof QuestionIdSchema>;
  readonly text: z.infer<typeof BilingualPublicTextSchema>;
};

export type WorkflowRetentionRegister = {
  readonly dissentClaimIds: readonly z.infer<typeof ClaimIdSchema>[];
  readonly openQuestions: readonly WorkflowOpenQuestion[];
};

function uuidFrom(seed: unknown): string {
  const hash = hashCanonical(seed);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function workflowOpenQuestion(
  runId: string,
  text: z.infer<typeof BilingualPublicTextSchema>,
): WorkflowOpenQuestion {
  const canonicalText = BilingualPublicTextSchema.parse(text);
  return {
    questionId: QuestionIdSchema.parse(
      uuidFrom({ kind: "workflow_open_question", runId, text: canonicalText }),
    ),
    text: canonicalText,
  };
}

function expectedStage(
  kind: z.infer<typeof AgentOutputCandidateSchema>["kind"],
): z.infer<typeof AgentOutputStageSchema> | undefined {
  switch (kind) {
    case "memo":
      return "memo";
    case "department_consolidation":
      return "department_consolidation";
    case "blind_challenge":
      return "blind_challenge";
    case "owner_response_ballot":
      return "owner_response_ballot";
    case "follow_up":
      return "follow_up";
    case "semantic_audit":
      return "semantic_audit";
    case "chair_synthesis":
      return "chair_synthesis";
  }
}

async function authenticatedPayload(
  cas: ArtifactCasPort,
  reference: WorkflowParentReference,
  runId: string,
  snapshotId: string,
) {
  const stored = await cas.get(reference.contentHash);
  if (
    stored === undefined ||
    stored.descriptor.artifactId !== reference.artifactId ||
    stored.descriptor.runId !== runId ||
    stored.descriptor.snapshotId !== snapshotId ||
    stored.descriptor.digest !== reference.contentHash ||
    stored.descriptor.mediaType !==
      "application/vnd.stocksembly.agent-output+json" ||
    hashBytes(stored.bytes) !== reference.contentHash
  )
    return undefined;
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(stored.bytes));
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  const parsed = ParentEnvelopeSchema.safeParse(decoded);
  const slot = requiredArtifactSlotById(reference.logicalArtifactKey);
  if (
    !parsed.success ||
    slot === undefined ||
    parsed.data.runId !== runId ||
    parsed.data.snapshotId !== snapshotId ||
    parsed.data.logicalArtifactId !== reference.logicalArtifactKey ||
    parsed.data.roleId !== slot.ownerId ||
    parsed.data.stage !== slot.stage ||
    expectedStage(parsed.data.payload.kind) !== slot.stage ||
    hashCanonical(parsed.data.payload) !== parsed.data.outputHash
  )
    return undefined;
  return parsed.data.payload;
}

export async function authenticatedWorkflowRetentionRegister(
  cas: ArtifactCasPort,
  references: readonly WorkflowParentReference[],
  runId: string,
  snapshotId: string,
): Promise<WorkflowRetentionRegister | undefined> {
  const dissent = new Set<z.infer<typeof ClaimIdSchema>>();
  for (const reference of references) {
    const payload = await authenticatedPayload(
      cas,
      reference,
      runId,
      snapshotId,
    );
    if (payload === undefined) return undefined;
    if (payload.kind === "memo") {
      for (const item of payload.dissent) dissent.add(item.claimId);
      for (const position of payload.positions)
        if (position.stance === "opposes") dissent.add(position.claimId);
    }
    if (payload.kind === "department_consolidation") {
      for (const claimId of payload.disagreementClaimIds) dissent.add(claimId);
      for (const item of payload.dissent) dissent.add(item.claimId);
    }
    if (payload.kind === "blind_challenge") {
      for (const claimId of payload.challengedClaimIds) dissent.add(claimId);
    }
    if (payload.kind === "owner_response_ballot") {
      for (const item of payload.dissent) dissent.add(item.claimId);
    }
  }
  return {
    dissentClaimIds: [...dissent].sort(),
    openQuestions: [],
  };
}
