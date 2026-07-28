import {
  FollowUpOutputSchema,
  OwnerResponseBallotOutputSchema,
} from "../domain/agentOutputs";
import { hashCanonical } from "../domain/contractHelpers";
import { JobIdSchema, QuestionIdSchema } from "../domain/ids";
import {
  WORKFLOW_V1_ROLE_REGISTRY,
  type WorkflowDepartmentId,
} from "../domain/roleRegistry";
import { codexInputHash } from "../server/codex/codexRunner";
import type { AuthenticatedRoundInput } from "./followupAndResponseRoundAuthentication";
import {
  FollowupJobPromptSchema,
  OwnerResponseJobPromptSchema,
  type PersistedFollowupResponseJob,
  PersistedFollowupResponseJobSchema,
  type PublicUnknown,
} from "./followupAndResponseRoundContracts";

function uuidFrom(value: unknown): string {
  const hash = hashCanonical(value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

type FollowupPriority = {
  readonly materiality: "material" | "supporting";
  readonly contradiction: "direct" | "partial" | "not_established";
  readonly evidenceArtifactIds: readonly string[];
  readonly targetDepartmentId: WorkflowDepartmentId;
};

export function compareFollowupPriority(
  left: FollowupPriority,
  right: FollowupPriority,
): number {
  const materiality = { material: 2, supporting: 1 } as const;
  const impact = { direct: 3, partial: 2, not_established: 1 } as const;
  return (
    materiality[right.materiality] - materiality[left.materiality] ||
    impact[right.contradiction] - impact[left.contradiction] ||
    right.evidenceArtifactIds.length - left.evidenceArtifactIds.length ||
    left.targetDepartmentId.localeCompare(right.targetDepartmentId)
  );
}

export function rankedFollowupJobs(
  runId: string,
  inputs: AuthenticatedRoundInput,
  allowed: number,
): readonly PersistedFollowupResponseJob[] {
  return inputs.challenges
    .filter((challenge) => challenge.payload.followupRequest !== null)
    .sort((left, right) =>
      compareFollowupPriority(
        {
          materiality: left.payload.materiality,
          contradiction: left.payload.contradiction,
          evidenceArtifactIds: left.payload.evidenceArtifactIds,
          targetDepartmentId: left.targetDepartmentId,
        },
        {
          materiality: right.payload.materiality,
          contradiction: right.payload.contradiction,
          evidenceArtifactIds: right.payload.evidenceArtifactIds,
          targetDepartmentId: right.targetDepartmentId,
        },
      ),
    )
    .slice(0, allowed)
    .map((challenge) => {
      const request = challenge.payload.followupRequest;
      if (request === null)
        throw new TypeError("ranked follow-up request is missing");
      const requestId = QuestionIdSchema.parse(
        uuidFrom({ runId, claimId: request.targetClaimId }),
      );
      const sourceArtifactIds = [
        challenge.artifactId,
        ...request.evidenceArtifactIds,
      ];
      const prompt = JSON.stringify(
        FollowupJobPromptSchema.parse({
          kind: "bounded_followup_input_v1",
          requestId,
          actorId: challenge.targetDepartmentId,
          targetClaimId: request.targetClaimId,
          targetContext: challenge.payload.publicChallenge,
          requestKind: request.kind,
          sourceArtifactIds,
          evidenceArtifactIds: request.evidenceArtifactIds,
        }),
      );
      return PersistedFollowupResponseJobSchema.parse({
        runId,
        snapshotId: inputs.snapshotId,
        jobId: JobIdSchema.parse(uuidFrom({ runId, requestId })),
        logicalArtifactId: `followup:${challenge.targetDepartmentId}`,
        stage: "follow_up",
        prompt,
        inputHash: codexInputHash({
          stage: "follow_up",
          prompt,
          outputSchema: FollowUpOutputSchema,
        }),
        inputManifestHash: hashCanonical(sourceArtifactIds),
        citableArtifactIds: sourceArtifactIds,
      });
    });
}

export function memberMemoIds(
  inputs: AuthenticatedRoundInput,
  departmentId: WorkflowDepartmentId,
): readonly string[] {
  const members = WORKFLOW_V1_ROLE_REGISTRY.departments[departmentId].memberIds;
  return inputs.memos
    .filter((memo) => members.includes(memo.roleId as never))
    .map((memo) => memo.artifactId);
}

function memberContext(
  inputs: AuthenticatedRoundInput,
  departmentId: WorkflowDepartmentId,
) {
  const members = WORKFLOW_V1_ROLE_REGISTRY.departments[departmentId].memberIds;
  return inputs.memos
    .filter((memo) => members.includes(memo.roleId as never))
    .flatMap((memo) => [
      ...memo.payload.positions.map((position) => position.publicSummary),
      ...memo.payload.dissent.map((item) => item.publicSummary),
      ...memo.payload.unknowns,
    ])
    .slice(0, 32);
}

export function publicUnknowns(
  _inputs: AuthenticatedRoundInput,
  _selected: readonly PersistedFollowupResponseJob[],
): readonly PublicUnknown[] {
  return [];
}

export function ownerResponseJobs(
  runId: string,
  inputs: AuthenticatedRoundInput,
  followupArtifacts: readonly {
    readonly artifact_id: string;
    readonly logical_artifact_key: string;
  }[],
  unknowns: readonly PublicUnknown[],
): readonly PersistedFollowupResponseJob[] {
  return inputs.challenges.map((challenge) => {
    const followupId = followupArtifacts.find(
      (item) =>
        item.logical_artifact_key ===
        `followup:${challenge.targetDepartmentId}`,
    )?.artifact_id;
    const sourceArtifactIds = [
      challenge.artifactId,
      ...memberMemoIds(inputs, challenge.targetDepartmentId),
      ...(followupId === undefined ? [] : [followupId]),
    ];
    const targetClaimIds = challenge.payload.challengedClaimIds;
    const relevantUnknowns = unknowns.filter((unknown) =>
      unknown.en.includes(targetClaimIds[0] ?? ""),
    );
    const prompt = JSON.stringify(
      OwnerResponseJobPromptSchema.parse({
        kind: "owner_response_input_v1",
        departmentId: challenge.targetDepartmentId,
        sourceArtifactIds,
        targetClaimIds,
        challengeContext: challenge.payload.publicChallenge,
        departmentContext: memberContext(
          inputs,
          challenge.targetDepartmentId,
        ),
        publicUnknowns: relevantUnknowns,
      }),
    );
    return PersistedFollowupResponseJobSchema.parse({
      runId,
      snapshotId: inputs.snapshotId,
      jobId: JobIdSchema.parse(
        uuidFrom({ runId, response: challenge.targetDepartmentId }),
      ),
      logicalArtifactId: `response_ballot:${challenge.targetDepartmentId}`,
      stage: "owner_response_ballot",
      prompt,
      inputHash: codexInputHash({
        stage: "owner_response_ballot",
        prompt,
        outputSchema: OwnerResponseBallotOutputSchema,
      }),
      inputManifestHash: hashCanonical(sourceArtifactIds),
      citableArtifactIds: sourceArtifactIds,
    });
  });
}

export { uuidFrom };
