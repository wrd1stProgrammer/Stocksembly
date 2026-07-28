import type Database from "better-sqlite3";
import { z } from "zod";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import { parseSafeJson } from "./safeJson";

export type AgentOutputInspectionClaim = {
  readonly runId: z.infer<typeof RunIdSchema>;
  readonly jobId: z.infer<typeof JobIdSchema>;
  readonly attemptId: z.infer<typeof AttemptIdSchema>;
  readonly ordinal: number;
  readonly ownerId: string;
  readonly token: number;
  readonly now: string;
};

const BindingRowSchema = z.object({
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  job_id: JobIdSchema,
  attempt_id: AttemptIdSchema,
  ordinal: z.number().int().positive(),
  logical_artifact_key: z.string(),
  input_hash: z.string(),
  job_input_manifest_hash: z.string(),
  attempt_input_manifest_hash: z.string(),
  prompt_hash: z.string(),
  schema_hash: z.string(),
  runner_input_hash: z.string(),
  runner_binary_hash: z.string(),
  runner_cli_version: z.string(),
  runner_stage: z.string(),
  runner_model: z.enum(["gpt-5.6-terra", "gpt-5.6-luna"]),
  runner_reasoning: z.enum(["low", "medium"]),
  runner_browsing_policy: z.enum(["disabled", "audited_web"]),
  runner_tool_transcript_hash: z.string(),
  attempt_status: z.string(),
  job_status: z.string(),
  lease_owner: z.string().nullable(),
  lease_token: z.number().int().nonnegative(),
  lease_expires_at: z.string().nullable(),
  commit_owner: z.string().nullable(),
  commit_token: z.number().int().positive().nullable(),
});
const CitationRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  content_hash: z.string(),
  locator_json: z.string(),
});

export function inspectAgentOutputBinding(
  database: Database.Database,
  claim: AgentOutputInspectionClaim,
): unknown {
  const value = database
    .prepare(`SELECT attempts.run_id, attempts.snapshot_id, attempts.job_id,
      attempts.attempt_id, research_call_ordinals.ordinal,
      attempts.logical_artifact_key, attempts.input_hash,
      jobs.input_manifest_hash AS job_input_manifest_hash,
      attempts.input_manifest_hash AS attempt_input_manifest_hash,
      agent_runner_evidence.prompt_hash,
      agent_runner_evidence.schema_hash,
      agent_runner_evidence.input_hash AS runner_input_hash,
      agent_runner_evidence.binary_hash AS runner_binary_hash,
      agent_runner_evidence.cli_version AS runner_cli_version,
      agent_runner_evidence.stage AS runner_stage,
      agent_runner_evidence.model AS runner_model,
      agent_runner_evidence.reasoning AS runner_reasoning,
      agent_runner_evidence.browsing_policy AS runner_browsing_policy,
      agent_runner_evidence.tool_transcript_hash AS runner_tool_transcript_hash,
      attempts.status AS attempt_status, jobs.status AS job_status,
      jobs.lease_owner, jobs.lease_token, jobs.lease_expires_at,
      agent_output_commits.owner_id AS commit_owner,
      agent_output_commits.fence_token AS commit_token
    FROM attempts
    JOIN jobs USING (job_id)
    JOIN research_call_ordinals USING (attempt_id)
    JOIN agent_runner_evidence USING (attempt_id)
    LEFT JOIN agent_output_commits USING (attempt_id)
    WHERE attempts.run_id = @runId AND attempts.job_id = @jobId
      AND attempts.attempt_id = @attemptId
      AND research_call_ordinals.ordinal = @ordinal`)
    .get(claim);
  if (value === undefined) return undefined;
  const parsedRow = BindingRowSchema.safeParse(value);
  if (!parsedRow.success) return undefined;
  const row = parsedRow.data;
  const committedClaim =
    row.attempt_status === "succeeded" &&
    row.job_status === "succeeded" &&
    row.commit_owner === claim.ownerId &&
    row.commit_token === claim.token;
  const activeClaim =
    row.attempt_status === "running" &&
    row.job_status === "running" &&
    row.lease_owner === claim.ownerId &&
    row.lease_token === claim.token &&
    row.lease_expires_at !== null &&
    row.lease_expires_at > claim.now;
  if (!committedClaim && !activeClaim) return undefined;
  const citations = database
    .prepare(`SELECT artifacts.artifact_id AS artifact_id,
      artifacts.run_id AS run_id, artifacts.snapshot_id AS snapshot_id,
      artifacts.content_hash AS content_hash,
      artifact_citation_metadata.locator_json AS locator_json
    FROM job_input_artifacts
    JOIN artifacts USING (artifact_id)
    JOIN artifact_citation_metadata USING (artifact_id)
    WHERE job_input_artifacts.job_id = ?
    UNION ALL
    SELECT artifacts.artifact_id AS artifact_id,
      artifacts.run_id AS run_id, artifacts.snapshot_id AS snapshot_id,
      artifacts.content_hash AS content_hash,
      artifact_citation_metadata.locator_json AS locator_json
    FROM attempt_web_evidence
    JOIN artifacts USING (artifact_id)
    JOIN artifact_citation_metadata USING (artifact_id)
    WHERE attempt_web_evidence.attempt_id = ?
      AND attempt_web_evidence.tool_transcript_hash = ?
    ORDER BY artifact_id`)
    .all(claim.jobId, claim.attemptId, row.runner_tool_transcript_hash)
    .map((entry) => {
      const citation = CitationRowSchema.parse(entry);
      return {
        artifactId: citation.artifact_id,
        runId: citation.run_id,
        snapshotId: citation.snapshot_id,
        contentHash: citation.content_hash,
        locator: parseSafeJson(citation.locator_json),
      };
    });
  return {
    runId: row.run_id,
    snapshotId: row.snapshot_id,
    jobId: row.job_id,
    attemptId: row.attempt_id,
    ordinal: row.ordinal,
    logicalArtifactId: row.logical_artifact_key,
    inputHash: row.input_hash,
    jobInputManifestHash: row.job_input_manifest_hash,
    attemptInputManifestHash: row.attempt_input_manifest_hash,
    promptHash: row.prompt_hash,
    schemaHash: row.schema_hash,
    runnerInputHash: row.runner_input_hash,
    runnerBinaryHash: row.runner_binary_hash,
    runnerCliVersion: row.runner_cli_version,
    runnerStage: row.runner_stage,
    runnerModel: row.runner_model,
    runnerReasoning: row.runner_reasoning,
    runnerBrowsingPolicy: row.runner_browsing_policy,
    runnerToolTranscriptHash: row.runner_tool_transcript_hash,
    status: "running",
    currentFence: { ownerId: claim.ownerId, token: claim.token },
    citableArtifacts: citations,
  };
}
