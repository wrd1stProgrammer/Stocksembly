import { z } from "zod";
import { OwnerResponseBallotOutputSchema } from "../domain/agentOutputs";
import { BilingualPublicTextSchema } from "../domain/agentOutputsShared";
import { hashCanonical } from "../domain/contractHelpers";
import { ArtifactIdSchema, SnapshotIdSchema } from "../domain/ids";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import { withResearchTransaction } from "../server/persistence/postgres/database";
import { parseSafeJson } from "../server/persistence/postgres/safeJson";
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

export class FollowupAndResponseRoundPostgresAuthority {
  readonly #database: ResearchDatabase;

  constructor(database: ResearchDatabase) {
    this.#database = database;
  }

  async replacementCount(runId: string): Promise<number> {
    return CountSchema.parse(
      (
        await this.#database.query(
          `SELECT COUNT(*)::integer AS count
      FROM attempts WHERE run_id = $1 AND replacement_of_attempt_id IS NOT NULL`,
          [runId],
        )
      ).rows[0],
    ).count;
  }

  async loadJob(
    runId: string,
    logicalArtifactId: string,
  ): Promise<PersistedFollowupResponseJob | undefined> {
    const value = (
      await this.#database.query(
        `SELECT result_json FROM idempotency_records
      WHERE scope = 'followup-response-job' AND idempotency_key = $1`,
        [`${runId}:${logicalArtifactId}`],
      )
    ).rows[0];
    const row = z.object({ result_json: z.string() }).safeParse(value);
    return row.success
      ? PersistedFollowupResponseJobSchema.parse(
          parseSafeJson(row.data.result_json),
        )
      : undefined;
  }

  async accepted(runId: string, prefix: "followup" | "response_ballot") {
    return (
      await this.#database.query(
        `SELECT agent_output_commits.artifact_id,
      attempts.logical_artifact_key, agent_output_commits.envelope_json
      FROM agent_output_commits JOIN attempts USING (attempt_id)
      WHERE attempts.run_id = $1 AND attempts.logical_artifact_key LIKE $2
      ORDER BY attempts.logical_artifact_key`,
        [runId, `${prefix}:%`],
      )
    ).rows.map((row) => AcceptedRowSchema.parse(row));
  }

  async savePlan(plan: DurableFollowupPlan, at: string): Promise<void> {
    const parsed = DurablePlanSchema.parse(plan);
    await this.#database.query(
      `INSERT INTO idempotency_records(scope, idempotency_key,
      request_hash, result_json, created_at) VALUES ('followup-response-plan', $1, $2, $3, $4)
      ON CONFLICT(scope, idempotency_key) DO UPDATE SET
        request_hash = excluded.request_hash,
        result_json = excluded.result_json, created_at = excluded.created_at`,
      [parsed.runId, hashCanonical(parsed), JSON.stringify(parsed), at],
    );
  }

  async loadUnknowns(runId: string): Promise<readonly PublicUnknown[]> {
    return (await this.loadPlan(runId))?.unknowns ?? [];
  }

  async loadPlan(runId: string): Promise<DurableFollowupPlan | undefined> {
    const row = z
      .object({ request_hash: z.string(), result_json: z.string() })
      .safeParse(
        (
          await this.#database.query(
            `SELECT request_hash, result_json FROM idempotency_records
            WHERE scope = 'followup-response-plan' AND idempotency_key = $1`,
            [runId],
          )
        ).rows[0],
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

  async hasPlanRecord(runId: string): Promise<boolean> {
    return (
      CountSchema.parse(
        (
          await this.#database.query(
            `SELECT COUNT(*)::integer AS count FROM idempotency_records
            WHERE scope = 'followup-response-plan' AND idempotency_key = $1`,
            [runId],
          )
        ).rows[0],
      ).count === 1
    );
  }

  async jobsSettled(
    runId: string,
    logicalArtifactIds: readonly string[],
  ): Promise<boolean> {
    const rows = (
      await this.#database.query(
        "SELECT logical_key, status FROM jobs WHERE run_id = $1 AND logical_key = ANY($2::text[])",
        [runId, logicalArtifactIds],
      )
    ).rows.map((row) =>
      z.object({ logical_key: z.string(), status: z.string() }).parse(row),
    );
    return logicalArtifactIds.every((id) =>
      rows.some(
        (row) =>
          row.logical_key === id &&
          ["succeeded", "failed", "cancelled"].includes(row.status),
      ),
    );
  }

  async stageJobs(
    runId: string,
    jobs: readonly PersistedFollowupResponseJob[],
    phase: "followup" | "response",
    at: string,
  ): Promise<boolean> {
    return await withResearchTransaction(
      this.#database,
      async (transaction) => {
        const run = RunRowSchema.safeParse(
          (
            await transaction.query(
              `SELECT runs.snapshot_id,
        runs.status, snapshots.state AS snapshot_state FROM runs
        JOIN snapshots ON snapshots.snapshot_id = runs.snapshot_id
        WHERE runs.run_id = $1 FOR UPDATE OF runs`,
              [runId],
            )
          ).rows[0],
        );
        if (
          !run.success ||
          jobs.some((job) => job.snapshotId !== run.data.snapshot_id)
        )
          return false;
        const pattern =
          phase === "followup" ? "followup:%" : "response_ballot:%";
        const existingRows = (
          await transaction.query(
            "SELECT logical_key, input_hash FROM jobs WHERE run_id = $1 AND logical_key LIKE $2",
            [runId, pattern],
          )
        ).rows.map((row) =>
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
          await transaction.query(
            `UPDATE runs SET requested_optional_calls = $1
          WHERE run_id = $2 AND requested_optional_calls >= $3`,
            [jobs.length, runId, jobs.length],
          );
        const insert = `INSERT INTO jobs(job_id, run_id, snapshot_id,
        kind, logical_key, input_hash, input_manifest_hash, status, created_at)
        VALUES ($1, $2, $3, 'research', $4,
          $5, $6, 'queued', $7)`;
        const bind =
          "INSERT INTO job_input_artifacts(job_id, artifact_id) VALUES ($1, $2)";
        const persist = `INSERT INTO idempotency_records(scope,
        idempotency_key, request_hash, result_json, created_at)
        VALUES ('followup-response-job', $1, $2, $3, $4)`;
        for (const job of jobs) {
          if (existing.has(job.logicalArtifactId)) continue;
          await transaction.query(insert, [
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
      research_call_ordinals.logical_artifact_key, research_call_ordinals.attempt_id,
      attempts.outcome, CASE WHEN agent_runner_evidence.attempt_id IS NULL THEN 0 ELSE 1 END
      AS evidence_recorded FROM research_call_ordinals JOIN attempts USING (attempt_id)
      LEFT JOIN agent_runner_evidence USING (attempt_id) WHERE research_call_ordinals.run_id = $1
      AND (research_call_ordinals.logical_artifact_key LIKE 'followup:%'
        OR research_call_ordinals.logical_artifact_key LIKE 'response_ballot:%') ORDER BY ordinal`,
        [runId],
      )
    ).rows
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
    const followups = await this.accepted(runId, "followup");
    const ballots = await this.accepted(runId, "response_ballot");
    const votes = ballots.flatMap((row): BallotVote[] => {
      const envelope = z
        .object({ payload: OwnerResponseBallotOutputSchema })
        .passthrough()
        .safeParse(parseSafeJson(row.envelope_json));
      return envelope.success ? [envelope.data.payload.ballot.vote] : [];
    });
    return { snapshotId: run.snapshot_id, receipts, followups, ballots, votes };
  }

  close(): void {}
}
