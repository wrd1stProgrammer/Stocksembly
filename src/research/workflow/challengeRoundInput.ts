import { z } from "zod";
import {
  DepartmentConsolidationOutputSchema,
  MemoOutputSchema,
} from "../domain/agentOutputs";
import { hashBytes, hashCanonical } from "../domain/contractHelpers";
import { JobIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import { type ArtifactCasPort, ArtifactDigestSchema } from "../ports/artifacts";
import { codexInputHash } from "../server/codex/codexRunner";
import {
  CHALLENGE_ASSIGNMENTS,
  ChallengeDecisionSchema,
  ChallengeJobPromptSchema,
  type PersistedChallengeJob,
  PersistedChallengeJobSchema,
  type StageChallengeRoundResult,
} from "./challengeRoundContracts";
import {
  challengePromptIsBlindSafe,
  projectChallengePrompt,
} from "./challengeRoundProjection";
import type { AcceptedChallengeInputRow } from "./challengeRoundSqliteAuthority";

const MemoEnvelopeSchema = z
  .object({
    workflowVersion: z.literal("WorkflowV1"),
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    logicalArtifactId: z.string().regex(/^memo:[a-z_]+$/),
    roleId: z.enum(WORKFLOW_V1_SPECIALIST_IDS),
    outputHash: ArtifactDigestSchema,
    payload: MemoOutputSchema,
  })
  .passthrough();
const ConsolidationEnvelopeSchema = z
  .object({
    workflowVersion: z.literal("WorkflowV1"),
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    logicalArtifactId: z.string().regex(/^consolidation:[a-z_]+$/),
    outputHash: ArtifactDigestSchema,
    payload: DepartmentConsolidationOutputSchema,
  })
  .passthrough();
type MemoEnvelope = z.infer<typeof MemoEnvelopeSchema>;
type ConsolidationEnvelope = z.infer<typeof ConsolidationEnvelopeSchema>;
type AuthenticatedInputs = {
  readonly memos: readonly (MemoEnvelope & {
    readonly artifactId: AcceptedChallengeInputRow["artifact_id"];
    readonly contentHash: string;
  })[];
  readonly consolidations: readonly (ConsolidationEnvelope & {
    readonly artifactId: AcceptedChallengeInputRow["artifact_id"];
    readonly contentHash: string;
  })[];
};

function uuidFrom(value: unknown): string {
  const hash = hashCanonical(value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function authenticatedJson(
  cas: ArtifactCasPort,
  row: AcceptedChallengeInputRow,
): Promise<unknown | undefined> {
  const read = await cas.get(ArtifactDigestSchema.parse(row.content_hash));
  if (
    read === undefined ||
    read.descriptor.artifactId !== row.artifact_id ||
    read.descriptor.runId !== row.run_id ||
    read.descriptor.snapshotId !== row.snapshot_id ||
    read.descriptor.digest !== row.content_hash ||
    hashBytes(read.bytes) !== row.content_hash
  )
    return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(read.bytes));
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function validEnvelope(
  row: AcceptedChallengeInputRow,
  envelope: MemoEnvelope | ConsolidationEnvelope,
): boolean {
  return (
    envelope.runId === row.run_id &&
    envelope.snapshotId === row.snapshot_id &&
    envelope.logicalArtifactId === row.logical_artifact_key &&
    envelope.outputHash === hashCanonical(envelope.payload)
  );
}

async function authenticatedInputs(
  cas: ArtifactCasPort,
  memoRows: readonly AcceptedChallengeInputRow[],
  consolidationRows: readonly AcceptedChallengeInputRow[],
): Promise<AuthenticatedInputs | undefined> {
  const memos: AuthenticatedInputs["memos"][number][] = [];
  for (const row of memoRows) {
    const parsed = MemoEnvelopeSchema.safeParse(
      await authenticatedJson(cas, row),
    );
    if (!parsed.success || !validEnvelope(row, parsed.data)) return undefined;
    memos.push({
      ...parsed.data,
      artifactId: row.artifact_id,
      contentHash: row.content_hash,
    });
  }
  const consolidations: AuthenticatedInputs["consolidations"][number][] = [];
  for (const row of consolidationRows) {
    const parsed = ConsolidationEnvelopeSchema.safeParse(
      await authenticatedJson(cas, row),
    );
    if (!parsed.success || !validEnvelope(row, parsed.data)) return undefined;
    consolidations.push({
      ...parsed.data,
      artifactId: row.artifact_id,
      contentHash: row.content_hash,
    });
  }
  return { memos, consolidations };
}

export async function challengeJobs(
  cas: ArtifactCasPort,
  rows: {
    readonly memos: readonly AcceptedChallengeInputRow[];
    readonly consolidations: readonly AcceptedChallengeInputRow[];
  },
  input: { readonly runId: string; readonly artifactIds: readonly string[] },
): Promise<
  | {
      readonly kind: "accepted";
      readonly jobs: readonly PersistedChallengeJob[];
    }
  | Extract<StageChallengeRoundResult, { readonly kind: "blocked" }>
> {
  if (
    rows.memos.length !== WORKFLOW_V1_SPECIALIST_IDS.length ||
    rows.consolidations.length !== 4
  )
    return { kind: "blocked", reason: "accepted_consolidation_set_incomplete" };
  if (
    hashCanonical(rows.consolidations.map((row) => row.artifact_id).sort()) !==
    hashCanonical([...input.artifactIds].sort())
  )
    return { kind: "blocked", reason: "cross_run_or_snapshot_consolidation" };
  const authenticated = await authenticatedInputs(
    cas,
    rows.memos,
    rows.consolidations,
  );
  if (authenticated === undefined)
    return {
      kind: "blocked",
      reason: "consolidation_artifact_authentication_failed",
    };
  const snapshotId = rows.consolidations[0]?.snapshot_id;
  if (snapshotId === undefined)
    return { kind: "blocked", reason: "accepted_consolidation_set_incomplete" };
  const prompts = CHALLENGE_ASSIGNMENTS.map((assignment) =>
    projectChallengePrompt(assignment, authenticated),
  );
  if (prompts.some((prompt) => prompt === undefined))
    return { kind: "blocked", reason: "counterevidence_unavailable" };
  if (
    prompts.some(
      (prompt) => prompt !== undefined && !challengePromptIsBlindSafe(prompt),
    )
  )
    return { kind: "blocked", reason: "blind_input_unsafe" };
  const jobs = prompts.map((requestInput, index) => {
    const request = ChallengeJobPromptSchema.parse(requestInput);
    const assignment = CHALLENGE_ASSIGNMENTS[index];
    if (assignment === undefined)
      throw new TypeError("challenge assignment is missing");
    const prompt = JSON.stringify(request);
    const citableArtifactIds = [
      ...new Set([
        ...request.sourceArtifactIds,
        ...request.target.evidenceArtifactIds,
        ...request.counterpoint.evidenceArtifactIds,
      ]),
    ];
    return PersistedChallengeJobSchema.parse({
      runId: input.runId,
      snapshotId,
      challengerId: assignment.challengerId,
      targetDepartmentId: assignment.targetDepartmentId,
      jobId: JobIdSchema.parse(
        uuidFrom({
          runId: input.runId,
          challengerId: assignment.challengerId,
        }),
      ),
      logicalArtifactId: `challenge:${assignment.challengerId}`,
      prompt,
      inputHash: codexInputHash({
        stage: "blind_challenge",
        prompt,
        outputSchema: ChallengeDecisionSchema,
      }),
      inputManifestHash: hashCanonical(request.sourceArtifacts),
      citableArtifactIds,
    });
  });
  return { kind: "accepted", jobs };
}
