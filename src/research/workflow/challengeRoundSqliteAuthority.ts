import Database from "better-sqlite3";
import { z } from "zod";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { WORKFLOW_V1_DEPARTMENT_IDS } from "../domain/roleRegistry";
import { applyOrderedMigrations } from "../server/persistence/sqlite/migrations";
import { parseSafeJson } from "../server/persistence/sqlite/safeJson";
import type {
  ChallengeDurableReceipt,
  PersistedChallengeJob,
} from "./challengeRoundContracts";
import { PersistedChallengeJobSchema } from "./challengeRoundContracts";

const AcceptedRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  logical_artifact_key: z.string(),
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
export type AcceptedChallengeInputRow = z.infer<typeof AcceptedRowSchema>;

export class ChallengeRoundSqliteAuthority {
  readonly #database: Database.Database;

  constructor(
    path: string,
    options: { readonly migrationsDirectory?: string } = {},
  ) {
    this.#database = new Database(path, { timeout: 5_000 });
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("synchronous = FULL");
    this.#database.pragma("busy_timeout = 5000");
    applyOrderedMigrations(this.#database, options.migrationsDirectory);
  }

  acceptedRows(
    runId: string,
    logicalPrefix: "memo" | "consolidation" | "challenge",
  ): readonly AcceptedChallengeInputRow[] {
    return this.#database
      .prepare(`SELECT agent_output_commits.artifact_id, attempts.run_id,
        attempts.snapshot_id, artifacts.content_hash,
        attempts.logical_artifact_key, agent_output_commits.envelope_json
      FROM agent_output_commits JOIN attempts USING (attempt_id)
      JOIN artifacts ON artifacts.artifact_id = agent_output_commits.artifact_id
      WHERE attempts.run_id = ? AND attempts.logical_artifact_key LIKE ?
      ORDER BY attempts.logical_artifact_key`)
      .all(runId, `${logicalPrefix}:%`)
      .map((value) => AcceptedRowSchema.parse(value));
  }

  loadJob(
    runId: string,
    logicalArtifactId: string,
  ): PersistedChallengeJob | undefined {
    const value = this.#database
      .prepare(`SELECT result_json FROM idempotency_records
        WHERE scope = 'challenge-round-job' AND idempotency_key = ?`)
      .get(`${runId}:${logicalArtifactId}`);
    const row = z.object({ result_json: z.string() }).safeParse(value);
    return row.success
      ? PersistedChallengeJobSchema.parse(parseSafeJson(row.data.result_json))
      : undefined;
  }

  stageJobs(
    runId: string,
    jobs: readonly PersistedChallengeJob[],
    acceptedArtifactIds: readonly string[],
    at: string,
  ): boolean {
    return this.#database
      .transaction(() => {
        const run = RunRowSchema.safeParse(
          this.#database
            .prepare(`SELECT runs.snapshot_id, runs.status,
              snapshots.state AS snapshot_state FROM runs
              JOIN snapshots ON snapshots.snapshot_id = runs.snapshot_id
              WHERE runs.run_id = ?`)
            .get(runId),
        );
        if (
          !run.success ||
          run.data.status !== "running" ||
          run.data.snapshot_state !== "sealed" ||
          jobs.length !== WORKFLOW_V1_DEPARTMENT_IDS.length
        )
          return false;
        const durableIds = this.acceptedRows(runId, "consolidation").map(
          (row) => row.artifact_id,
        );
        if (
          durableIds.length !== WORKFLOW_V1_DEPARTMENT_IDS.length ||
          acceptedArtifactIds.length !== durableIds.length ||
          durableIds.some((id) => !acceptedArtifactIds.includes(id))
        )
          return false;
        const existing = z
          .object({ count: z.number().int().nonnegative() })
          .parse(
            this.#database
              .prepare(`SELECT COUNT(*) AS count FROM jobs
                WHERE run_id = ? AND logical_key LIKE 'challenge:%'`)
              .get(runId),
          ).count;
        if (existing === jobs.length) return true;
        if (existing !== 0) return false;
        const insertJob = this.#database.prepare(`INSERT INTO jobs(
          job_id, run_id, snapshot_id, kind, logical_key, input_hash,
          input_manifest_hash, status, created_at
        ) VALUES (@jobId, @runId, @snapshotId, 'research',
          @logicalArtifactId, @inputHash, @inputManifestHash, 'queued', @at)`);
        const bind = this.#database.prepare(`INSERT INTO job_input_artifacts(
          job_id, artifact_id) VALUES (?, ?)`);
        const persist = this.#database.prepare(`INSERT INTO idempotency_records(
          scope, idempotency_key, request_hash, result_json, created_at
        ) VALUES ('challenge-round-job', @key, @inputHash, @resultJson, @at)`);
        for (const job of jobs) {
          if (job.snapshotId !== run.data.snapshot_id) return false;
          insertJob.run({ ...job, at });
          persist.run({
            ...job,
            key: `${runId}:${job.logicalArtifactId}`,
            resultJson: JSON.stringify(job),
            at,
          });
          for (const artifactId of job.citableArtifactIds)
            bind.run(job.jobId, artifactId);
        }
        return true;
      })
      .immediate();
  }

  replay(runId: string) {
    const run = z
      .object({ snapshot_id: SnapshotIdSchema })
      .parse(
        this.#database
          .prepare("SELECT snapshot_id FROM runs WHERE run_id = ?")
          .get(runId),
      );
    const receipts = this.#database
      .prepare(`SELECT research_call_ordinals.ordinal,
        research_call_ordinals.logical_artifact_key,
        research_call_ordinals.attempt_id, attempts.outcome,
        CASE WHEN agent_runner_evidence.attempt_id IS NULL THEN 0 ELSE 1 END
          AS evidence_recorded FROM research_call_ordinals
        JOIN attempts USING (attempt_id)
        LEFT JOIN agent_runner_evidence USING (attempt_id)
        WHERE research_call_ordinals.run_id = ?
          AND research_call_ordinals.logical_artifact_key LIKE 'challenge:%'
        ORDER BY ordinal`)
      .all(runId)
      .map((value) => ReceiptRowSchema.parse(value))
      .map(
        (row): ChallengeDurableReceipt => ({
          ordinal: row.ordinal,
          challengerId: z
            .enum(WORKFLOW_V1_DEPARTMENT_IDS)
            .parse(row.logical_artifact_key.replace(/^challenge:/, "")),
          attemptId: row.attempt_id,
          outcome: row.outcome ?? "reserved",
          evidenceRecorded: row.evidence_recorded === 1,
        }),
      );
    const commits = this.#database
      .prepare(`SELECT agent_output_commits.artifact_id,
        attempts.logical_artifact_key, run_events.sequence
        FROM agent_output_commits JOIN attempts USING (attempt_id)
        JOIN run_events ON run_events.event_id = agent_output_commits.event_id
        WHERE attempts.run_id = ?
          AND attempts.logical_artifact_key LIKE 'challenge:%'
        ORDER BY run_events.sequence`)
      .all(runId)
      .map((value) => CommitRowSchema.parse(value));
    return { snapshotId: run.snapshot_id, receipts, commits };
  }

  close(): void {
    if (this.#database.open) this.#database.close();
  }
}
