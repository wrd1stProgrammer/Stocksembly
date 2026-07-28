import type Database from "better-sqlite3";
import { z } from "zod";
import { RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS } from "../domain/roleRegistryArtifacts";

const ParentRowSchema = z.object({
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  logical_key: z.string(),
  accepted: z.number().int().min(0).max(1),
});

export function hasSealedWorkflowParents(
  database: Database.Database,
  structuralArtifactId: string,
  runId: string,
  snapshotId: string,
): boolean {
  const required = WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS.filter(
    (slot) =>
      slot.stage !== "semantic_audit" && slot.stage !== "chair_synthesis",
  ).map((slot) => slot.logicalArtifactId);
  const rows = database
    .prepare(`SELECT artifacts.run_id, artifacts.snapshot_id,
      artifacts.logical_key,
      CASE WHEN agent_output_commits.artifact_id IS NULL THEN 0 ELSE 1 END AS accepted
    FROM artifact_edges JOIN artifacts
      ON artifacts.artifact_id = artifact_edges.parent_artifact_id
    LEFT JOIN agent_output_commits
      ON agent_output_commits.artifact_id = artifacts.artifact_id
    WHERE artifact_edges.child_artifact_id = ?
      AND artifact_edges.relation = 'audits'`)
    .all(structuralArtifactId)
    .flatMap((row) => {
      const parsed = ParentRowSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    })
    .filter((row) => required.includes(row.logical_key));
  return (
    rows.length === required.length &&
    new Set(rows.map((row) => row.logical_key)).size === required.length &&
    rows.every(
      (row) =>
        row.run_id === runId &&
        row.snapshot_id === snapshotId &&
        row.accepted === 1,
    ) &&
    required.every((key) => rows.some((row) => row.logical_key === key))
  );
}
