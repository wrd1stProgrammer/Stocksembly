import { z } from "zod";
import {
  DepartmentConsolidationOutputSchema,
  MemoOutputSchema,
} from "../domain/agentOutputs";
import { hashBytes, hashCanonical } from "../domain/contractHelpers";
import { JobIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import {
  WORKFLOW_V1_DEPARTMENT_IDS,
  WORKFLOW_V1_ROLE_REGISTRY,
  WORKFLOW_V1_SPECIALIST_IDS,
} from "../domain/roleRegistry";
import { type ArtifactCasPort, ArtifactDigestSchema } from "../ports/artifacts";
import { codexInputHash } from "../server/codex/codexRunner";
import type {
  DepartmentJobPrompt,
  PersistedDepartmentJob,
  StageDepartmentRoundResult,
} from "./departmentRoundContracts";
import {
  DepartmentJobPromptSchema,
  PersistedDepartmentJobSchema,
} from "./departmentRoundContracts";
import type { AcceptedMemoRow } from "./departmentRoundSqliteAuthority";

const MemoEnvelopeSchema = z
  .object({
    workflowVersion: z.literal("WorkflowV1"),
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    logicalArtifactId: z.string().regex(/^memo:[a-z_]+$/),
    roleId: z.enum(WORKFLOW_V1_SPECIALIST_IDS),
    stage: z.literal("memo"),
    outputHash: ArtifactDigestSchema,
    payload: MemoOutputSchema,
  })
  .passthrough();

function uuidFrom(value: unknown): string {
  const hash = hashCanonical(value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function sameMembers(
  expected: readonly string[],
  received: readonly string[],
): boolean {
  return (
    expected.length === received.length &&
    new Set(received).size === received.length &&
    expected.every((value) => received.includes(value))
  );
}

export async function authenticatedMemoPrompts(
  cas: ArtifactCasPort,
  rows: readonly AcceptedMemoRow[],
  input: { readonly runId: string; readonly artifactIds: readonly string[] },
): Promise<
  | {
      readonly kind: "accepted";
      readonly prompts: readonly DepartmentJobPrompt[];
    }
  | {
      readonly kind: "blocked";
      readonly reason: Extract<
        StageDepartmentRoundResult,
        { readonly kind: "blocked" }
      >["reason"];
    }
> {
  if (rows.length === 0 || input.artifactIds.length !== rows.length)
    return { kind: "blocked", reason: "accepted_specialist_set_incomplete" };
  const rowIds = rows.map((row) => row.artifact_id);
  if (!sameMembers(rowIds, input.artifactIds))
    return { kind: "blocked", reason: "cross_run_or_snapshot_member" };
  const members: DepartmentJobPrompt["memberArtifacts"][number][] = [];
  for (const row of rows) {
    const read = await cas.get(ArtifactDigestSchema.parse(row.content_hash));
    if (
      read === undefined ||
      read.descriptor.artifactId !== row.artifact_id ||
      read.descriptor.runId !== row.run_id ||
      read.descriptor.snapshotId !== row.snapshot_id ||
      read.descriptor.digest !== row.content_hash ||
      hashBytes(read.bytes) !== row.content_hash
    )
      return {
        kind: "blocked",
        reason: "member_artifact_authentication_failed",
      };
    let decoded: unknown;
    try {
      decoded = JSON.parse(new TextDecoder().decode(read.bytes));
    } catch (error) {
      if (error instanceof SyntaxError)
        return {
          kind: "blocked",
          reason: "member_artifact_authentication_failed",
        };
      throw error;
    }
    const envelope = MemoEnvelopeSchema.safeParse(decoded);
    const roleId = row.logical_artifact_key.replace(/^memo:/, "");
    if (
      !envelope.success ||
      envelope.data.runId !== input.runId ||
      envelope.data.runId !== row.run_id ||
      envelope.data.snapshotId !== row.snapshot_id ||
      envelope.data.roleId !== roleId ||
      envelope.data.logicalArtifactId !== row.logical_artifact_key ||
      envelope.data.outputHash !== hashCanonical(envelope.data.payload)
    )
      return {
        kind: "blocked",
        reason: "member_artifact_authentication_failed",
      };
    members.push({
      artifactId: row.artifact_id,
      contentHash: row.content_hash,
      ownership: { roleId: envelope.data.roleId },
      memo: envelope.data.payload,
    });
  }
  const prompts = WORKFLOW_V1_DEPARTMENT_IDS.flatMap((departmentId) => {
    const department = WORKFLOW_V1_ROLE_REGISTRY.departments[departmentId];
    const memberArtifacts = department.memberIds.flatMap((roleId) => {
      const member = members.find(
        (candidate) => candidate.ownership.roleId === roleId,
      );
      return member === undefined ? [] : [member];
    });
    return memberArtifacts.length === department.memberIds.length
      ? [
          DepartmentJobPromptSchema.parse({
            kind: "department_consolidation_input_v1",
            department: {
              id: departmentId,
              leadId: department.leadId,
              memberIds: department.memberIds,
            },
            memberArtifacts,
          }),
        ]
      : [];
  });
  return prompts.length === 0
    ? { kind: "blocked", reason: "accepted_specialist_set_incomplete" }
    : { kind: "accepted", prompts };
}

export function departmentJobs(
  runId: string,
  snapshotId: string,
  prompts: readonly DepartmentJobPrompt[],
): readonly PersistedDepartmentJob[] {
  return prompts.map((request) => {
    const prompt = JSON.stringify(request);
    const memberArtifactIds = request.memberArtifacts.map(
      (member) => member.artifactId,
    );
    const citableArtifactIds = [
      ...new Set([
        ...memberArtifactIds,
        ...request.memberArtifacts.flatMap((member) => [
          ...member.memo.sourceArtifactIds,
          ...member.memo.positions.flatMap(
            (position) => position.evidenceArtifactIds,
          ),
        ]),
      ]),
    ];
    return PersistedDepartmentJobSchema.parse({
      runId,
      snapshotId,
      departmentId: request.department.id,
      leadId: request.department.leadId,
      jobId: JobIdSchema.parse(
        uuidFrom({ runId, departmentId: request.department.id }),
      ),
      logicalArtifactId: `consolidation:${request.department.id}`,
      prompt,
      inputHash: codexInputHash({
        stage: "department_consolidation",
        prompt,
        outputSchema: DepartmentConsolidationOutputSchema,
      }),
      inputManifestHash: hashCanonical(
        request.memberArtifacts.map((member) => ({
          artifactId: member.artifactId,
          contentHash: member.contentHash,
          roleId: member.ownership.roleId,
        })),
      ),
      memberArtifactIds,
      citableArtifactIds,
    });
  });
}
