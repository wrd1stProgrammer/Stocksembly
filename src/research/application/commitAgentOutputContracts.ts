import { z } from "zod";
import {
  type AgentOutputCandidate,
  BlindChallengeOutputSchema,
  ChairSynthesisOutputSchema,
  DepartmentConsolidationOutputSchema,
  FollowUpOutputSchema,
  MemoOutputSchema,
  OwnerResponseBallotOutputSchema,
  SemanticAuditOutputSchema,
} from "../domain/agentOutputs";
import { CALL_BUDGET_POLICY } from "../domain/callBudgetContracts";
import { SourceLocatorSchema } from "../domain/evidenceCoreSchemas";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  assertNever,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import type { AgentOutputStage } from "../domain/roleRegistry";
import {
  CODEX_RUNTIME_PINS,
  CODEX_RUNTIME_POLICY,
  LINUX_CODEX_RUNTIME_PINS,
} from "../server/codex/codexPolicy";

export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const FenceSchema = z
  .object({ ownerId: z.string().min(1), token: z.number().int().positive() })
  .strict();
export const BindingSchema = z
  .object({
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    jobId: JobIdSchema,
    attemptId: AttemptIdSchema,
    ordinal: z
      .number()
      .int()
      .positive()
      .max(CALL_BUDGET_POLICY.maxPhysicalLaunches),
    logicalArtifactId: z.string().min(1),
    inputHash: HashSchema,
    jobInputManifestHash: HashSchema,
    attemptInputManifestHash: HashSchema,
    promptHash: HashSchema,
    schemaHash: HashSchema,
    runnerBinaryHash: HashSchema,
    runnerCliVersion: z.string().min(1),
    runnerInputHash: HashSchema,
    runnerStage: z.enum([
      "memo",
      "department_consolidation",
      "blind_challenge",
      "owner_response_ballot",
      "follow_up",
      "semantic_audit",
      "chair_synthesis",
    ]),
    runnerModel: z.literal("gpt-5.6-terra"),
    runnerReasoning: z.literal("medium"),
    runnerBrowsingPolicy: z.enum(["disabled", "audited_web"]),
    runnerToolTranscriptHash: HashSchema,
    status: z.literal("running"),
    currentFence: FenceSchema,
    citableArtifacts: z
      .array(
        z
          .object({
            artifactId: ArtifactIdSchema,
            runId: RunIdSchema,
            snapshotId: SnapshotIdSchema,
            contentHash: HashSchema,
            locator: z.unknown(),
          })
          .strict(),
      )
      .max(64),
  })
  .strict();
export const TRUSTED_AGENT_RUNTIME_POLICY = Object.freeze({
  model: CODEX_RUNTIME_POLICY.model,
  reasoningByStage: Object.freeze({
    memo: CODEX_RUNTIME_POLICY.reasoningByStage.memo,
    department_consolidation:
      CODEX_RUNTIME_POLICY.reasoningByStage.department_consolidation,
    blind_challenge: CODEX_RUNTIME_POLICY.reasoningByStage.blind_challenge,
    owner_response_ballot:
      CODEX_RUNTIME_POLICY.reasoningByStage.owner_response_ballot,
    follow_up: CODEX_RUNTIME_POLICY.reasoningByStage.follow_up,
    semantic_audit: CODEX_RUNTIME_POLICY.reasoningByStage.semantic_audit,
    chair_synthesis: CODEX_RUNTIME_POLICY.reasoningByStage.chair_synthesis,
  }),
  browsingByStage: Object.freeze({
    memo: CODEX_RUNTIME_POLICY.browsingByStage.memo,
    department_consolidation:
      CODEX_RUNTIME_POLICY.browsingByStage.department_consolidation,
    blind_challenge: CODEX_RUNTIME_POLICY.browsingByStage.blind_challenge,
    owner_response_ballot:
      CODEX_RUNTIME_POLICY.browsingByStage.owner_response_ballot,
    follow_up: CODEX_RUNTIME_POLICY.browsingByStage.follow_up,
    semantic_audit: CODEX_RUNTIME_POLICY.browsingByStage.semantic_audit,
    chair_synthesis: CODEX_RUNTIME_POLICY.browsingByStage.chair_synthesis,
  }),
  emptyToolTranscriptHash:
    "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
  cliVersion:
    process.platform === "linux"
      ? LINUX_CODEX_RUNTIME_PINS.version
      : CODEX_RUNTIME_PINS.version,
  cliBinaryHash:
    process.platform === "linux"
      ? LINUX_CODEX_RUNTIME_PINS.originSha256
      : CODEX_RUNTIME_PINS.originSha256,
});
export const CitationLocatorSchema = z.union([
  SourceLocatorSchema,
  z
    .object({
      kind: z.literal("web"),
      source: z.literal("codex_web"),
      sourceUrl: z.string().url(),
      title: z.string().min(1).max(1_024),
      publisher: z.string().min(1).max(512),
      retrievedAt: z.string().datetime(),
      excerpt: z.string().max(8_192),
      contentHash: HashSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("artifact"),
      artifactId: ArtifactIdSchema,
      contentHash: HashSchema,
    })
    .strict(),
]);

export function parseStagePayload(
  stage: AgentOutputStage,
  candidate: unknown,
): AgentOutputCandidate | undefined {
  switch (stage) {
    case "memo":
      return MemoOutputSchema.safeParse(candidate).data;
    case "department_consolidation":
      return DepartmentConsolidationOutputSchema.safeParse(candidate).data;
    case "blind_challenge":
      return BlindChallengeOutputSchema.safeParse(candidate).data;
    case "owner_response_ballot":
      return OwnerResponseBallotOutputSchema.safeParse(candidate).data;
    case "follow_up":
      return FollowUpOutputSchema.safeParse(candidate).data;
    case "semantic_audit":
      return SemanticAuditOutputSchema.safeParse(candidate).data;
    case "chair_synthesis":
      return ChairSynthesisOutputSchema.safeParse(candidate).data;
    default:
      return assertNever(stage);
  }
}

export function referencedArtifactIds(
  payload: AgentOutputCandidate,
): readonly z.infer<typeof ArtifactIdSchema>[] {
  switch (payload.kind) {
    case "memo":
      return [
        ...payload.sourceArtifactIds,
        ...payload.positions.flatMap(
          (position) => position.evidenceArtifactIds,
        ),
      ];
    case "department_consolidation":
      return [
        ...payload.sourceArtifactIds,
        ...payload.evidencePriorityArtifactIds,
      ];
    case "owner_response_ballot":
      return payload.sourceArtifactIds;
    case "blind_challenge":
    case "follow_up":
      return [...payload.sourceArtifactIds, ...payload.evidenceArtifactIds];
    case "semantic_audit":
      return [
        ...payload.sourceArtifactIds,
        ...payload.verdicts.flatMap((verdict) => verdict.evidenceArtifactIds),
      ];
    case "chair_synthesis":
      return [...payload.sourceArtifactIds, ...payload.ballotArtifactIds];
    default:
      return assertNever(payload);
  }
}

export function committedEventType(stage: AgentOutputStage): string {
  switch (stage) {
    case "memo":
      return "specialist_memo_committed";
    case "department_consolidation":
      return "department_consolidation_committed";
    case "blind_challenge":
      return "challenge_committed";
    case "owner_response_ballot":
      return "owner_response_committed";
    case "follow_up":
      return "followup_committed";
    case "semantic_audit":
      return "semantic_audit_committed";
    case "chair_synthesis":
      return "chair_synthesis_committed";
    default:
      return assertNever(stage);
  }
}
