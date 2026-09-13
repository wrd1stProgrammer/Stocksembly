import { z } from "zod";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import {
  WORKFLOW_V1_DEPARTMENT_IDS,
  WORKFLOW_V1_SPECIALIST_IDS,
} from "../domain/roleRegistry";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import { withResearchTransaction } from "../server/persistence/postgres/database";
import { parseSafeJson } from "../server/persistence/postgres/safeJson";
import type {
  AcceptedMemoMetadata,
  DepartmentDurableReceipt,
  PersistedDepartmentJob,
} from "./departmentRoundContracts";
import { PersistedDepartmentJobSchema } from "./departmentRoundContracts";

const MemoRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  logical_artifact_key: z.string().regex(/^memo:[a-z_]+$/),
  envelope_json: z.string(),
});
const RunRowSchema = z.object({
  snapshot_id: SnapshotIdSchema,
  status: z.string(),
  snapshot_state: z.string(),
});
const ReceiptRowSchema = z.object({
  ordinal: z.number().int().positive(),
  logical_artifact_key: z.string(),
  attempt_id: z.string().uuid(),
  outcome: z.string().nullable(),
  evidence_recorded: z.number().int().min(0).max(1),
});
const CommitRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  logical_artifact_key: z.string(),
  sequence: z.number().int().positive(),
});

export type AcceptedMemoRow = z.infer<typeof MemoRowSchema>;

export class DepartmentRoundPostgresAuthority {
  readonly #database: ResearchDatabase;

  constructor(database: ResearchDatabase) {
    this.#database = database;
  }

  async acceptedMemoRows(
    runId: string,
    database: ResearchDatabase = this.#database,
  ): Promise<readonly AcceptedMemoRow[]> {
    return (
      await database.query(
        `SELECT agent_output_commits.artifact_id, attempts.run_id,
        attempts.snapshot_id, artifacts.content_hash,
        attempts.logical_artifact_key, agent_output_commits.envelope_json
      FROM agent_output_commits JOIN attempts USING (attempt_id)
      JOIN artifacts ON artifacts.artifact_id = agent_output_commits.artifact_id
      WHERE attempts.run_id = $1 AND attempts.logical_artifact_key LIKE 'memo:%'
      ORDER BY attempts.logical_artifact_key`,
        [runId],
      )
    ).rows.map((value) => MemoRowSchema.parse(value));
  }

  async isFocusedRun(runId: string): Promise<boolean> {
    const row = z
      .object({ research_kind: z.string() })
      .safeParse(
        (
          await this.#database.query(
            "SELECT research_kind FROM research_requests WHERE run_id = $1",
            [runId],
          )
        ).rows[0],
      );
    return row.success && row.data.research_kind === "department";
  }

  async evidenceRows(runId: string, artifactIds: readonly string[]) {
    const allowed = new Set(artifactIds);
    return (
      await this.#database.query(
        `SELECT artifacts.artifact_id, artifacts.content_hash
      FROM artifacts JOIN runs ON runs.snapshot_id = artifacts.snapshot_id
      WHERE runs.run_id = $1 FOR UPDATE OF runs`,
        [runId],
      )
    ).rows
      .map((row) =>
        z
          .object({
            artifact_id: ArtifactIdSchema,
            content_hash: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .parse(row),
      )
      .filter((row) => allowed.has(row.artifact_id));
  }

  async acceptedMemos(runId: string): Promise<readonly AcceptedMemoMetadata[]> {
    return (await this.acceptedMemoRows(runId)).map((row) => ({
      roleId: z
        .enum(WORKFLOW_V1_SPECIALIST_IDS)
        .parse(row.logical_artifact_key.replace(/^memo:/, "")),
      artifactId: row.artifact_id,
      snapshotId: row.snapshot_id,
      contentHash: row.content_hash,
    }));
  }

  async loadJob(
    runId: string,
    logicalArtifactId: string,
    database: ResearchDatabase = this.#database,
  ): Promise<PersistedDepartmentJob | undefined> {
    const value = (
      await database.query(
        `SELECT result_json FROM idempotency_records
        WHERE scope = 'department-round-job' AND idempotency_key = $1`,
        [`${runId}:${logicalArtifactId}`],
      )
    ).rows[0];
    const row = z.object({ result_json: z.string() }).safeParse(value);
    return row.success
      ? PersistedDepartmentJobSchema.parse(parseSafeJson(row.data.result_json))
      : undefined;
  }

  async stageJobs(
    runId: string,
    jobs: readonly PersistedDepartmentJob[],
    acceptedArtifactIds: readonly string[],
    at: string,
  ): Promise<boolean> {
    return await withResearchTransaction(
      this.#database,
      async (transaction) => {
        const run = RunRowSchema.safeParse(
          (
            await transaction.query(
              `SELECT runs.snapshot_id, runs.status,
              snapshots.state AS snapshot_state FROM runs
              JOIN snapshots ON snapshots.snapshot_id = runs.snapshot_id
              WHERE runs.run_id = $1 FOR UPDATE OF runs`,
              [runId],
            )
          ).rows[0],
        );
        if (
          !run.success ||
          run.data.status !== "running" ||
          run.data.snapshot_state !== "sealed"
        )
          return false;
        const durableIds = (
          await this.acceptedMemoRows(runId, transaction)
        ).map((row) => row.artifact_id);
        if (
          acceptedArtifactIds.length !== durableIds.length ||
          durableIds.some((id) => !acceptedArtifactIds.includes(id))
        )
          return false;
        const insertJob = `INSERT INTO jobs(
          job_id, run_id, snapshot_id, kind, logical_key, input_hash,
          input_manifest_hash, status, created_at
        ) VALUES ($1, $2, $3, 'research',
          $4, $5, $6, 'queued', $7)`;
        const bind = `INSERT INTO job_input_artifacts(
          job_id, artifact_id) VALUES ($1, $2)`;
        const persist = `INSERT INTO idempotency_records(
          scope, idempotency_key, request_hash, result_json, created_at
        ) VALUES ('department-round-job', $1, $2, $3, $4)`;
        for (const job of jobs) {
          if (job.snapshotId !== run.data.snapshot_id) return false;
          const existing = await this.loadJob(
            runId,
            job.logicalArtifactId,
            transaction,
          );
          if (existing !== undefined) {
            if (existing.inputHash !== job.inputHash) return false;
            continue;
          }
          await transaction.query(insertJob, [
            job.jobId,
            job.runId,
            job.snapshotId,
            job.logicalArtifactId,
            job.inputHash,
            job.inputManifestHash,
            at,
          ]);
          await transaction.query(persist, [
            `${runId}:${job.logicalArtifactId}`,
            job.inputHash,
            JSON.stringify(job),
            at,
          ]);
          for (const artifactId of job.citableArtifactIds)
            await transaction.query(bind, [job.jobId, artifactId]);
        }
        return true;
      },
    );
  }

  async replay(runId: string) {
    const run = z
      .object({ snapshot_id: SnapshotIdSchema })
      .parse(
        (
          await this.#database.query(
            "SELECT snapshot_id FROM runs WHERE run_id = $1",
            [runId],
          )
        ).rows[0],
      );
    const receipts = (
      await this.#database.query(
        `SELECT research_call_ordinals.ordinal,
        research_call_ordinals.logical_artifact_key,
        research_call_ordinals.attempt_id, attempts.outcome,
        CASE WHEN agent_runner_evidence.attempt_id IS NULL THEN 0 ELSE 1 END
          AS evidence_recorded FROM research_call_ordinals
        JOIN attempts USING (attempt_id)
        LEFT JOIN agent_runner_evidence USING (attempt_id)
        WHERE research_call_ordinals.run_id = $1
          AND research_call_ordinals.logical_artifact_key LIKE 'consolidation:%'
        ORDER BY ordinal`,
        [runId],
      )
    ).rows
      .map((value) => ReceiptRowSchema.parse(value))
      .map(
        (row): DepartmentDurableReceipt => ({
          ordinal: row.ordinal,
          departmentId: z
            .enum(WORKFLOW_V1_DEPARTMENT_IDS)
            .parse(row.logical_artifact_key.replace(/^consolidation:/, "")),
          attemptId: row.attempt_id,
          outcome: row.outcome ?? "reserved",
          evidenceRecorded: row.evidence_recorded === 1,
        }),
      );
    const commits = (
      await this.#database.query(
        `SELECT agent_output_commits.artifact_id,
        attempts.logical_artifact_key, run_events.sequence
        FROM agent_output_commits JOIN attempts USING (attempt_id)
        JOIN run_events ON run_events.event_id = agent_output_commits.event_id
        WHERE attempts.run_id = $1
          AND attempts.logical_artifact_key LIKE 'consolidation:%'
        ORDER BY run_events.sequence`,
        [runId],
      )
    ).rows.map((value) => CommitRowSchema.parse(value));
    return { snapshotId: run.snapshot_id, receipts, commits };
  }

  close(): void {}
}
