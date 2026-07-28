import { z } from "zod";
import type { AllAgentAssignmentsV1 } from "../application/assignAllAgents";
import type { EvidenceSliceV1 } from "../application/assignAllAgentsContracts";
import type { SnapshotManifest } from "../application/buildSnapshot";
import type { ResearchMandateV1 } from "../application/createMandateContracts";
import { BilingualPublicTextSchema } from "../domain/agentOutputsShared";
import { HashSchema } from "../domain/evidenceSchemas";
import {
  type AttemptId,
  type ClaimId,
  ClaimIdSchema,
  type JobId,
  type QuestionId,
  QuestionIdSchema,
  type RunId,
  type SnapshotId,
} from "../domain/ids";
import {
  EVIDENCE_NEEDS,
  type SpecialistRoleId,
  WORKFLOW_V1_SPECIALIST_IDS,
} from "../domain/roleRegistry";
import type { ValueRecord } from "../domain/valueRegistry";

const EvidenceRefSchema = z
  .object({ evidenceId: z.string().min(1), contentHash: HashSchema })
  .strict()
  .readonly();

const AtomicMemoClaimSchema = z
  .object({
    claimId: ClaimIdSchema,
    stance: z.enum(["supports", "opposes", "uncertain"]),
    publicSummary: BilingualPublicTextSchema,
    evidenceRefs: z.array(EvidenceRefSchema).min(1).max(32).readonly(),
    calculationValueIds: z.array(z.string().min(1)).max(16).readonly(),
    uncertainty: BilingualPublicTextSchema,
    changeCondition: BilingualPublicTextSchema,
  })
  .strict()
  .readonly();

const OpposingEvidenceSchema = z
  .object({
    publicSummary: BilingualPublicTextSchema,
    evidenceRefs: z.array(EvidenceRefSchema).min(1).max(16).readonly(),
  })
  .strict()
  .readonly();

const FollowUpProposalSchema = z
  .object({
    questionId: QuestionIdSchema,
    publicQuestion: BilingualPublicTextSchema,
    evidenceNeed: z.enum(EVIDENCE_NEEDS),
  })
  .strict()
  .readonly();

export const SpecialistMemoCandidateSchema = z
  .object({
    kind: z.literal("specialist_memo_v1"),
    roleId: z.enum(WORKFLOW_V1_SPECIALIST_IDS),
    publicSummary: BilingualPublicTextSchema,
    claims: z.array(AtomicMemoClaimSchema).min(1).max(32).readonly(),
    opposingEvidence: z.array(OpposingEvidenceSchema).max(16).readonly(),
    unknowns: z.array(BilingualPublicTextSchema).min(1).max(32).readonly(),
    followUpProposals: z.array(FollowUpProposalSchema).max(3).readonly(),
  })
  .strict()
  .readonly();
export type SpecialistMemoCandidate = z.infer<
  typeof SpecialistMemoCandidateSchema
>;

export type SpecialistRoundInput = {
  readonly mandate: ResearchMandateV1;
  readonly snapshot: SnapshotManifest;
  readonly assignments: AllAgentAssignmentsV1;
};

export type SpecialistJobRequest = {
  readonly promptName: string;
  readonly schemaName: string;
  readonly snapshotId: string;
  readonly evidenceCutoffAt: string;
  readonly role: {
    readonly id: SpecialistRoleId;
    readonly name: string;
    readonly focusAreas: readonly string[];
    readonly evidenceNeeds: readonly (typeof EVIDENCE_NEEDS)[number][];
    readonly requiredOutputs: readonly string[];
    readonly forbiddenOutputs: readonly string[];
  };
  readonly mandate: {
    readonly mandateHash: string;
    readonly question?: string;
    readonly scope: "broad" | "focused";
    readonly locale: "en" | "ko";
    readonly limitations: ResearchMandateV1["limitations"];
  };
  readonly capabilityStatement: EvidenceSliceV1["capabilities"];
  readonly evidenceSlice: EvidenceSliceV1;
  readonly registeredValues: readonly ValueRecord[];
  readonly attempt: {
    readonly jobId: JobId;
    readonly attemptId: AttemptId;
    readonly ordinal: number;
    readonly purpose: "mandatory_first" | "required_replacement";
  };
  readonly ids: { readonly claimId: ClaimId; readonly questionId: QuestionId };
};

export type SpecialistProcessResult =
  | { readonly kind: "succeeded"; readonly output: string }
  | { readonly kind: "crashed" | "timed_out" | "lost" | "uncertain" };

export interface SpecialistProcessPort {
  readonly run: (
    request: SpecialistJobRequest,
  ) => Promise<SpecialistProcessResult>;
}

export type SpecialistCommitInput = {
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly roleId: SpecialistRoleId;
  readonly candidate: SpecialistMemoCandidate;
  readonly candidateHash: string;
  readonly receiptHash: string;
  readonly request: SpecialistJobRequest;
};

export type SpecialistCommitResult =
  | {
      readonly kind: "committed";
      readonly artifactHash: string;
      readonly receiptHash: string;
    }
  | { readonly kind: "rejected" | "lost" };

export interface SpecialistCommitPort {
  readonly commit: (
    input: SpecialistCommitInput,
  ) => Promise<SpecialistCommitResult>;
}

export type SpecialistPublicEvent = {
  readonly kind: "specialist_memo_committed";
  readonly roleId: SpecialistRoleId;
  readonly artifactHash: string;
  readonly publicSummary: z.infer<typeof BilingualPublicTextSchema>;
};

export interface SpecialistPublicEventPort {
  readonly append: (event: SpecialistPublicEvent) => Promise<void>;
}

export type SpecialistRoundDependencies = {
  readonly runner: SpecialistProcessPort;
  readonly committer: SpecialistCommitPort;
  readonly publicEvents: SpecialistPublicEventPort;
};

export type SpecialistReceipt = {
  readonly roleId: SpecialistRoleId;
  readonly ordinal: number;
  readonly attemptId: string;
  readonly outcome:
    | "accepted"
    | "invalid"
    | "crashed"
    | "timed_out"
    | "lost"
    | "uncertain";
  readonly receiptHash: string;
};

export type AcceptedSpecialistMemo = {
  readonly roleId: SpecialistRoleId;
  readonly artifactHash: string;
  readonly candidate: SpecialistMemoCandidate;
};

export type SpecialistRoundResult = {
  readonly kind: "complete" | "incomplete";
  readonly departmentStartAllowed: boolean;
  readonly acceptedMemos: readonly AcceptedSpecialistMemo[];
  readonly receipts: readonly SpecialistReceipt[];
  readonly missingRoleIds: readonly SpecialistRoleId[];
};
