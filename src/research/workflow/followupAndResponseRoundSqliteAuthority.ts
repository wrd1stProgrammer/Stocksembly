import Database from "better-sqlite3";
import { z } from "zod";
import { OwnerResponseBallotOutputSchema } from "../domain/agentOutputs";
import { BilingualPublicTextSchema } from "../domain/agentOutputsShared";
import { hashCanonical } from "../domain/contractHelpers";
import { ArtifactIdSchema, SnapshotIdSchema } from "../domain/ids";
import { applyOrderedMigrations } from "../server/persistence/sqlite/migrations";
import { parseSafeJson } from "../server/persistence/sqlite/safeJson";
import type {
  BallotVote,
  FollowupResponseReceipt,
  PersistedFollowupResponseJob,
  PublicUnknown,
} from "./followupAndResponseRoundContracts";
import { PersistedFollowupResponseJobSchema } from "./followupAndResponseRoundContracts";

const RunRowSchema = z.object({
  snapshot_id: SnapshotIdSchema,
  status: z.literal("running"),
  snapshot_state: z.literal("sealed"),
});
const AcceptedRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  logical_artifact_key: z.string(),
  envelope_json: z.string(),
});
const ReceiptRowSchema = z.object({
  ordinal: z.number().int().positive(),
  logical_artifact_key: z.string(),
  attempt_id: z.string().uuid(),
  outcome: z.string().nullable(),
  evidence_recorded: z.number().int().min(0).max(1),
});
const CountSchema = z.object({ count: z.number().int().nonnegative() });
const DurablePlanSchema = z
  .object({
    runId: z.string().uuid(),
    snapshotId: SnapshotIdSchema,
    challengeArtifactIds: z.array(ArtifactIdSchema).length(4).readonly(),
    followupLogicalArtifactIds: z
      .array(z.string().regex(/^followup:[a-z_]+$/))
      .max(3)
      .readonly(),
    unknowns: z.array(BilingualPublicTextSchema).max(32).readonly(),
  })
  .strict()
  .readonly();
export type DurableFollowupPlan = z.infer<typeof DurablePlanSchema>;

export class FollowupAndResponseRoundSqliteAuthority {
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

  replacementCount(runId: string): number {
    return CountSchema.parse(
      this.#database
        .prepare(`SELECT COUNT(*) AS count
      FROM attempts WHERE run_id = ? AND replacement_of_attempt_id IS NOT NULL`)
        .get(runId),
    ).count;
  }

  loadJob(
    runId: string,
    logicalArtifactId: string,
  ): PersistedFollowupResponseJob | undefined {
    const value = this.#database
      .prepare(`SELECT result_json FROM idempotency_records
      WHERE scope = 'followup-response-job' AND idempotency_key = ?`)
      .get(`${runId}:${logicalArtifactId}`);
    const row = z.object({ result_json: z.string() }).safeParse(value);
    return row.success
      ? PersistedFollowupResponseJobSchema.parse(
          parseSafeJson(row.data.result_json),
        )
      : undefined;
  }

  accepted(runId: string, prefix: "followup" | "response_ballot") {
    return this.#database
      .prepare(`SELECT agent_output_commits.artifact_id,
      attempts.logical_artifact_key, agent_output_commits.envelope_json
      FROM agent_output_commits JOIN attempts USING (attempt_id)
      WHERE attempts.run_id = ? AND attempts.logical_artifact_key LIKE ?
      ORDER BY attempts.logical_artifact_key`)
      .all(runId, `${prefix}:%`)
      .map((row) => AcceptedRowSchema.parse(row));
  }

  savePlan(plan: DurableFollowupPlan, at: string): void {
    const parsed = DurablePlanSchema.parse(plan);
    this.#database
      .prepare(`INSERT INTO idempotency_records(scope, idempotency_key,
      request_hash, result_json, created_at) VALUES ('followup-response-plan', ?, ?, ?, ?)
      ON CONFLICT(scope, idempotency_key) DO UPDATE SET
        request_hash = excluded.request_hash,
        result_json = excluded.result_json, created_at = excluded.created_at`)
      .run(parsed.runId, hashCanonical(parsed), JSON.stringify(parsed), at);
  }

  loadUnknowns(runId: string): readonly PublicUnknown[] {
    return this.loadPlan(runId)?.unknowns ?? [];
  }

  loadPlan(runId: string): DurableFollowupPlan | undefined {
    const row = z
      .object({ request_hash: z.string(), result_json: z.string() })
      .safeParse(
        this.#database
          .prepare(`SELECT request_hash, result_json FROM idempotency_records
            WHERE scope = 'followup-response-plan' AND idempotency_key = ?`)
          .get(runId),
      );
    if (!row.success) return undefined;
    const plan = DurablePlanSchema.safeParse(
      parseSafeJson(row.data.result_json),
    );
    return plan.success &&
      plan.data.runId === runId &&
      hashCanonical(plan.data) === row.data.request_hash
      ? plan.data
      : undefined;
  }

  hasPlanRecord(runId: string): boolean {
    return (
      CountSchema.parse(
        this.#database
          .prepare(`SELECT COUNT(*) AS count FROM idempotency_records
            WHERE scope = 'followup-response-plan' AND idempotency_key = ?`)
          .get(runId),
      ).count === 1
    );
  }

  jobsSettled(runId: string, logicalArtifactIds: readonly string[]): boolean {
    const status = this.#database.prepare(
      "SELECT status FROM jobs WHERE run_id = ? AND logical_key = ?",
    );
    return logicalArtifactIds.every((logicalArtifactId) => {
      const row = z
        .object({ status: z.string() })
        .safeParse(status.get(runId, logicalArtifactId));
      return (
        row.success &&
        ["succeeded", "failed", "cancelled"].includes(row.data.status)
      );
    });
  }

  stageJobs(
    runId: string,
    jobs: readonly PersistedFollowupResponseJob[],
    phase: "followup" | "response",
    at: string,
  ): boolean {
    return this.#database
      .transaction(() => {
        const run = RunRowSchema.safeParse(
          this.#database
            .prepare(`SELECT runs.snapshot_id,
        runs.status, snapshots.state AS snapshot_state FROM runs
        JOIN snapshots ON snapshots.snapshot_id = runs.snapshot_id
        WHERE runs.run_id = ?`)
            .get(runId),
        );
        if (
          !run.success ||
          jobs.some((job) => job.snapshotId !== run.data.snapshot_id)
        )
          return false;
        const pattern =
          phase === "followup" ? "followup:%" : "response_ballot:%";
        const existingRows = this.#database
          .prepare(
            "SELECT logical_key, input_hash FROM jobs WHERE run_id = ? AND logical_key LIKE ?",
          )
          .all(runId, pattern)
          .map((row) =>
            z
              .object({ logical_key: z.string(), input_hash: z.string() })
              .parse(row),
          );
        const existing = new Map(
          existingRows.map((row) => [row.logical_key, row.input_hash]),
        );
        if (
          jobs.some((job) => {
            const inputHash = existing.get(job.logicalArtifactId);
            return inputHash !== undefined && inputHash !== job.inputHash;
          })
        )
          return false;
        if (phase === "followup")
          this.#database
            .prepare(`UPDATE runs SET requested_optional_calls = ?
          WHERE run_id = ? AND requested_optional_calls >= ?`)
            .run(jobs.length, runId, jobs.length);
        const insert =
          this.#database.prepare(`INSERT INTO jobs(job_id, run_id, snapshot_id,
        kind, logical_key, input_hash, input_manifest_hash, status, created_at)
        VALUES (@jobId, @runId, @snapshotId, 'research', @logicalArtifactId,
          @inputHash, @inputManifestHash, 'queued', @at)`);
        const bind = this.#database.prepare(
          "INSERT INTO job_input_artifacts(job_id, artifact_id) VALUES (?, ?)",
        );
        const persist =
          this.#database.prepare(`INSERT INTO idempotency_records(scope,
        idempotency_key, request_hash, result_json, created_at)
        VALUES ('followup-response-job', @key, @inputHash, @resultJson, @at)`);
        for (const job of jobs) {
          if (existing.has(job.logicalArtifactId)) continue;
          insert.run({ ...job, at });
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
      research_call_ordinals.logical_artifact_key, research_call_ordinals.attempt_id,
      attempts.outcome, CASE WHEN agent_runner_evidence.attempt_id IS NULL THEN 0 ELSE 1 END
      AS evidence_recorded FROM research_call_ordinals JOIN attempts USING (attempt_id)
      LEFT JOIN agent_runner_evidence USING (attempt_id) WHERE research_call_ordinals.run_id = ?
      AND (research_call_ordinals.logical_artifact_key LIKE 'followup:%'
        OR research_call_ordinals.logical_artifact_key LIKE 'response_ballot:%') ORDER BY ordinal`)
      .all(runId)
      .map((row) => ReceiptRowSchema.parse(row))
      .map(
        (row): FollowupResponseReceipt => ({
          ordinal: row.ordinal,
          logicalArtifactId: row.logical_artifact_key,
          attemptId: row.attempt_id,
          outcome: row.outcome ?? "reserved",
          evidenceRecorded: row.evidence_recorded === 1,
        }),
      );
    const followups = this.accepted(runId, "followup");
    const ballots = this.accepted(runId, "response_ballot");
    const votes = ballots.flatMap((row): BallotVote[] => {
      const envelope = z
        .object({ payload: OwnerResponseBallotOutputSchema })
        .passthrough()
        .safeParse(parseSafeJson(row.envelope_json));
      return envelope.success ? [envelope.data.payload.ballot.vote] : [];
    });
    return { snapshotId: run.snapshot_id, receipts, followups, ballots, votes };
  }

  close(): void {
    if (this.#database.open) this.#database.close();
  }
}
