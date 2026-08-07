import Database from "better-sqlite3";
import { z } from "zod";
import {
  auditStructuralClaims,
  retainStructurallyValidClaims,
} from "../application/structuralAudit";
import { StructuralAuditInputSchema } from "../application/structuralAuditContracts";
import {
  type PersistStructuralAuditResult,
  StructuralAuditArtifactEnvelopeSchema,
  type StructuralAuditPersistenceOptions,
  StructuralAuditResultSchema,
} from "../application/structuralAuditPersistenceContracts";
import { hashCanonical } from "../domain/contractHelpers";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import { WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS } from "../domain/roleRegistryArtifacts";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { applyOrderedMigrations } from "../server/persistence/sqlite/migrations";
import { parseSafeJson } from "../server/persistence/sqlite/safeJson";
import {
  replayStructuralAudit,
  writeStructuralAudit,
} from "./structuralAuditPersistenceWrite";
import { authenticatedWorkflowRetentionRegister } from "./structuralAuditWorkflowRegister";

const RunRowSchema = z.object({
  snapshot_id: SnapshotIdSchema,
  status: z.literal("running"),
  snapshot_state: z.literal("sealed"),
});
const WorkflowRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  content_hash: ArtifactDigestSchema,
  logical_artifact_key: z
    .string()
    .regex(/^(memo|consolidation|challenge|response_ballot):[a-z_]+$/),
});
const ArtifactRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  content_hash: ArtifactDigestSchema,
  locator_json: z.string(),
});
type DatabaseHandle = Database.Database;

function blocked(
  reason: Extract<PersistStructuralAuditResult, { kind: "blocked" }>["reason"],
): PersistStructuralAuditResult {
  return { kind: "blocked", reason };
}

function acceptedWorkflow(
  database: DatabaseHandle,
  runId: string,
  snapshotId: string,
) {
  const rows = database
    .prepare(`SELECT agent_output_commits.artifact_id, attempts.run_id,
      attempts.snapshot_id, attempts.logical_artifact_key,
      artifacts.content_hash
    FROM agent_output_commits JOIN attempts USING (attempt_id)
    JOIN artifacts ON artifacts.artifact_id = agent_output_commits.artifact_id
    WHERE attempts.run_id = ? AND (
      attempts.logical_artifact_key LIKE 'memo:%' OR
      attempts.logical_artifact_key LIKE 'consolidation:%' OR
      attempts.logical_artifact_key LIKE 'challenge:%' OR
      attempts.logical_artifact_key LIKE 'response_ballot:%')
    ORDER BY attempts.logical_artifact_key`)
    .all(runId)
    .map((row) => WorkflowRowSchema.parse(row));
  const memoRows = rows.filter((row) =>
    row.logical_artifact_key.startsWith("memo:"),
  );
  const roles = memoRows.map((row) =>
    z
      .enum(WORKFLOW_V1_SPECIALIST_IDS)
      .safeParse(row.logical_artifact_key.replace(/^memo:/, "")),
  );
  const count = (prefix: string) =>
    rows.filter((row) => row.logical_artifact_key.startsWith(prefix)).length;
  const requiredKeys = WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS.filter(
    (slot) =>
      slot.stage !== "semantic_audit" && slot.stage !== "chair_synthesis",
  ).map((slot) => slot.logicalArtifactId);
  if (
    rows.some(
      (row) => row.run_id !== runId || row.snapshot_id !== snapshotId,
    ) ||
    count("memo:") !== WORKFLOW_V1_SPECIALIST_IDS.length ||
    count("consolidation:") !== 4 ||
    count("challenge:") !== 4 ||
    count("response_ballot:") !== 4 ||
    new Set(rows.map((row) => row.logical_artifact_key)).size !==
      requiredKeys.length ||
    !requiredKeys.every((key) =>
      rows.some((row) => row.logical_artifact_key === key),
    ) ||
    roles.some((role) => !role.success) ||
    new Set(roles.flatMap((role) => (role.success ? [role.data] : []))).size !==
      WORKFLOW_V1_SPECIALIST_IDS.length
  )
    return undefined;
  return {
    artifactIds: rows.map((row) => row.artifact_id),
    references: rows.map((row) => ({
      artifactId: row.artifact_id,
      logicalArtifactKey: row.logical_artifact_key,
      contentHash: row.content_hash,
    })),
    memos: memoRows.map((row, index) => ({
      roleId: roles[index]?.data,
      artifactId: row.artifact_id,
      runId: row.run_id,
      snapshotId: row.snapshot_id,
    })),
  };
}

async function verifyEvidence(
  database: DatabaseHandle,
  options: StructuralAuditPersistenceOptions,
  input: z.infer<typeof StructuralAuditInputSchema>,
): Promise<PersistStructuralAuditResult | undefined> {
  for (const evidence of input.evidence) {
    const parsed = ArtifactRowSchema.safeParse(
      database
        .prepare(`SELECT artifacts.artifact_id, artifacts.run_id,
          artifacts.snapshot_id, artifacts.content_hash,
          artifact_citation_metadata.locator_json
        FROM artifacts JOIN artifact_citation_metadata USING (artifact_id)
        WHERE artifacts.artifact_id = ?`)
        .get(evidence.artifactId),
    );
    if (!parsed.success) return blocked("evidence_artifact_missing");
    const row = parsed.data;
    if (row.run_id !== input.runId || row.snapshot_id !== input.snapshotId)
      return blocked("cross_run_or_snapshot_evidence");
    const stored = await options.cas.get(row.content_hash);
    if (
      stored === undefined ||
      new TextDecoder().decode(stored.bytes) !== evidence.content ||
      row.content_hash !== evidence.contentHash
    )
      return blocked("artifact_content_mismatch");
    if (hashCanonical(parseSafeJson(row.locator_json)) !== evidence.locatorHash)
      return blocked("locator_hash_mismatch");
  }
  return undefined;
}

export async function persistStructuralAudit(
  options: StructuralAuditPersistenceOptions,
  raw: unknown,
): Promise<PersistStructuralAuditResult> {
  const parsed = StructuralAuditInputSchema.safeParse(raw);
  if (!parsed.success) return blocked("invalid_input");
  const database = new Database(options.databasePath, { timeout: 5_000 });
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("synchronous = FULL");
  database.pragma("busy_timeout = 5000");
  try {
    applyOrderedMigrations(database, options.migrationsDirectory);
    const run = RunRowSchema.safeParse(
      database
        .prepare(`SELECT runs.snapshot_id, runs.status,
          snapshots.state AS snapshot_state FROM runs
          JOIN snapshots ON snapshots.snapshot_id = runs.snapshot_id
          WHERE runs.run_id = ?`)
        .get(parsed.data.runId),
    );
    if (!run.success || run.data.snapshot_id !== parsed.data.snapshotId)
      return blocked("run_not_ready");
    const workflow = acceptedWorkflow(
      database,
      parsed.data.runId,
      parsed.data.snapshotId,
    );
    if (workflow === undefined)
      return blocked("accepted_workflow_set_incomplete");
    const retention = await authenticatedWorkflowRetentionRegister(
      options.cas,
      workflow.references,
      parsed.data.runId,
      parsed.data.snapshotId,
    );
    if (retention === undefined)
      return blocked("workflow_artifact_authentication_failed");
    const structuralClaimIds = new Set(
      parsed.data.claims.map((candidate) => candidate.claim.claimId),
    );
    const retainedDissentClaimIds = retention.dissentClaimIds.filter(
      (claimId) => structuralClaimIds.has(claimId),
    );
    const evidenceFailure = await verifyEvidence(
      database,
      options,
      parsed.data,
    );
    if (evidenceFailure !== undefined) return evidenceFailure;
    let trustedInput = StructuralAuditInputSchema.parse({
      ...parsed.data,
      acceptedMemos: workflow.memos,
      sourceDissentClaimIds: retainedDissentClaimIds,
      sourceOpenQuestionIds: retention.openQuestions.map(
        (question) => question.questionId,
      ),
      sourceOpenQuestions: retention.openQuestions,
    });
    let result = StructuralAuditResultSchema.parse(
      auditStructuralClaims(trustedInput),
    );
    if (!result.publishable) {
      const repairedInput = retainStructurallyValidClaims(trustedInput);
      if (
        repairedInput !== undefined &&
        repairedInput.claims.length < trustedInput.claims.length
      ) {
        const repairedResult = StructuralAuditResultSchema.parse(
          auditStructuralClaims(repairedInput),
        );
        if (repairedResult.publishable) {
          trustedInput = repairedInput;
          result = repairedResult;
        }
      }
    }
    const envelope = StructuralAuditArtifactEnvelopeSchema.parse({
      kind: "structural_audit",
      schemaVersion: "workflow-v1",
      runId: result.runId,
      snapshotId: result.snapshotId,
      auditHash: result.auditHash,
      claimSetHash: result.claimSetHash,
      publishable: result.publishable,
      result,
    });
    const requestHash = hashCanonical(trustedInput);
    const existing = replayStructuralAudit(database, result.runId, requestHash);
    if (existing !== undefined) return existing;
    return await writeStructuralAudit({
      database,
      options,
      input: trustedInput,
      envelope,
      requestHash,
      workflowArtifactIds: workflow.artifactIds,
    });
  } finally {
    database.close();
  }
}
