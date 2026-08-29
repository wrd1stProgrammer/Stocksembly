import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { z } from "zod";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { hashCanonical } from "../domain/contractHelpers";
import { ArtifactIdSchema, JobIdSchema, SnapshotIdSchema } from "../domain/ids";
import type { ArtifactCasPort } from "../ports/artifacts";
import { codexInputHash } from "../server/codex/codexRunner";
import { applyOrderedMigrations } from "../server/persistence/sqlite/migrations";
import { parseSafeJson } from "../server/persistence/sqlite/safeJson";
import {
  CHAIR_SECTION_KEYS,
  ChairSynthesisModelOutputSchema,
  type ChairSynthesisReplay,
  type PersistedChairJob,
  PersistedChairJobSchema,
} from "./chairSynthesisContracts";
import { loadChairPrompt } from "./chairSynthesisInput";
import { chairSynthesisModelPrompt } from "./chairSynthesisPrompts";

const RunSchema = z.object({
  snapshot_id: SnapshotIdSchema,
  status: z.literal("running"),
  snapshot_state: z.literal("sealed"),
});
const ReceiptSchema = z.object({
  ordinal: z.number().int().positive(),
  outcome: z.string().nullable(),
  evidence_recorded: z.number().int().min(0).max(1),
});
const AcceptedSchema = z.object({
  artifact_id: ArtifactIdSchema,
  envelope_json: z.string(),
});

export class ChairSynthesisSqliteAuthority {
  readonly #database: Database.Database;
  constructor(
    path: string,
    private readonly options: {
      readonly cas: ArtifactCasPort;
      readonly migrationsDirectory?: string;
    },
  ) {
    this.#database = new Database(path, { timeout: 5_000 });
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("synchronous = FULL");
    this.#database.pragma("busy_timeout = 5000");
    applyOrderedMigrations(this.#database, options.migrationsDirectory);
  }

  loadJob(runId: string): PersistedChairJob | undefined {
    const row = z
      .object({ result_json: z.string() })
      .safeParse(
        this.#database
          .prepare(
            "SELECT result_json FROM idempotency_records WHERE scope = 'chair-synthesis-job' AND idempotency_key = ?",
          )
          .get(runId),
      );
    return row.success
      ? PersistedChairJobSchema.parse(parseSafeJson(row.data.result_json))
      : undefined;
  }

  acceptedArtifactId(
    runId: string,
  ): z.infer<typeof ArtifactIdSchema> | undefined {
    const row = z.object({ artifact_id: ArtifactIdSchema }).safeParse(
      this.#database
        .prepare(`SELECT agent_output_commits.artifact_id
        FROM agent_output_commits JOIN attempts USING(attempt_id)
        WHERE attempts.run_id = ? AND attempts.logical_artifact_key = 'chair_synthesis:chair'`)
        .get(runId),
    );
    return row.success ? row.data.artifact_id : undefined;
  }

  async stage(runId: string, at: string): Promise<true | string> {
    const run = RunSchema.safeParse(
      this.#database
        .prepare(`SELECT runs.snapshot_id, runs.status,
      snapshots.state AS snapshot_state FROM runs
      JOIN snapshots ON snapshots.snapshot_id = runs.snapshot_id
      WHERE runs.run_id = ?`)
        .get(runId),
    );
    if (!run.success) return "run_not_ready";
    const prompt = await loadChairPrompt(
      this.#database,
      this.options.cas,
      runId,
    );
    if (prompt === undefined) return "audited_inputs_incomplete";
    const validationPrompt = JSON.stringify(prompt);
    const promptJson = chairSynthesisModelPrompt(prompt);
    const inputHash = codexInputHash({
      stage: "chair_synthesis",
      prompt: promptJson,
      outputSchema: ChairSynthesisModelOutputSchema,
    });
    const existing = this.loadJob(runId);
    if (existing !== undefined) {
      if (existing.inputHash === inputHash) return true;
      const sourceManifestHash = hashCanonical(prompt.sourceArtifactIds);
      if (
        existing.prompt !== promptJson ||
        existing.validationPrompt !== validationPrompt ||
        existing.inputManifestHash !== sourceManifestHash ||
        hashCanonical(existing.citableArtifactIds) !==
          hashCanonical(prompt.sourceArtifactIds)
      )
        return "chair_input_immutable";
      return this.#database
        .transaction(() => {
          const updatedJob = this.#database
            .prepare(`UPDATE jobs SET input_hash = @inputHash
              WHERE job_id = @jobId AND run_id = @runId
                AND logical_key = 'chair_synthesis:chair'
                AND status IN ('queued', 'retry-wait')
                AND lease_owner IS NULL
                AND NOT EXISTS (SELECT 1 FROM agent_output_commits
                  WHERE agent_output_commits.attempt_id = jobs.attempt_id)`)
            .run({ ...existing, inputHash }).changes;
          if (updatedJob !== 1) return "chair_input_immutable" as const;
          const refreshed = PersistedChairJobSchema.parse({
            ...existing,
            inputHash,
          });
          const updatedRecord = this.#database
            .prepare(`UPDATE idempotency_records SET request_hash = @inputHash,
              result_json = @resultJson, created_at = @at
              WHERE scope = 'chair-synthesis-job'
                AND idempotency_key = @runId`)
            .run({
              runId,
              inputHash,
              resultJson: JSON.stringify(refreshed),
              at,
            }).changes;
          if (updatedRecord !== 1)
            throw new TypeError("chair job refresh was incomplete");
          this.#database
            .prepare(`UPDATE idempotency_records SET request_hash = @inputHash,
              result_json = json_set(result_json,
                '$.retryAt', @at, '$.failureCount', 0,
                '$.circuitOpen', json('false'),
                '$.classification', 'transient',
                '$.code', 'schema_contract_refreshed'), created_at = @at
              WHERE scope = 'worker-retry' AND idempotency_key = @jobId`)
            .run({ jobId: existing.jobId, inputHash, at });
          return true as const;
        })
        .immediate();
    }
    const job = PersistedChairJobSchema.parse({
      runId,
      snapshotId: run.data.snapshot_id,
      jobId: JobIdSchema.parse(randomUUID()),
      logicalArtifactId: "chair_synthesis:chair",
      prompt: promptJson,
      validationPrompt,
      inputHash,
      inputManifestHash: hashCanonical(prompt.sourceArtifactIds),
      citableArtifactIds: prompt.sourceArtifactIds,
    });
    return this.#database
      .transaction(() => {
        this.#database
          .prepare(`INSERT INTO jobs(job_id, run_id, snapshot_id, kind,
        logical_key, input_hash, input_manifest_hash, status, created_at)
        VALUES (@jobId, @runId, @snapshotId, 'research', @logicalArtifactId,
        @inputHash, @inputManifestHash, 'queued', @at)`)
          .run({ ...job, at });
        this.#database
          .prepare(`INSERT INTO idempotency_records(scope,
        idempotency_key, request_hash, result_json, created_at)
        VALUES ('chair-synthesis-job', @runId, @inputHash, @resultJson, @at)`)
          .run({ ...job, resultJson: JSON.stringify(job), at });
        const bind = this.#database.prepare(
          "INSERT INTO job_input_artifacts(job_id, artifact_id) VALUES (?, ?)",
        );
        for (const artifactId of job.citableArtifactIds)
          bind.run(job.jobId, artifactId);
        return true as const;
      })
      .immediate();
  }

  replay(runId: string): ChairSynthesisReplay {
    const snapshotId = z
      .object({ snapshot_id: SnapshotIdSchema })
      .parse(
        this.#database
          .prepare("SELECT snapshot_id FROM runs WHERE run_id = ?")
          .get(runId),
      ).snapshot_id;
    const receipts = this.#database
      .prepare(`SELECT research_call_ordinals.ordinal,
      attempts.outcome, CASE WHEN agent_runner_evidence.attempt_id IS NULL THEN 0 ELSE 1 END AS evidence_recorded
      FROM research_call_ordinals JOIN attempts USING(attempt_id)
      LEFT JOIN agent_runner_evidence USING(attempt_id)
      WHERE research_call_ordinals.run_id = ? AND research_call_ordinals.logical_artifact_key = 'chair_synthesis:chair'
      ORDER BY ordinal`)
      .all(runId)
      .map((row) => ReceiptSchema.parse(row))
      .map((row) => ({
        ordinal: row.ordinal,
        outcome:
          row.outcome === "failed"
            ? "invalid_schema"
            : (row.outcome ?? "reserved"),
        evidenceRecorded: row.evidence_recorded === 1,
      }));
    const accepted = this.#database
      .prepare(`SELECT agent_output_commits.artifact_id,
      agent_output_commits.envelope_json FROM agent_output_commits JOIN attempts USING(attempt_id)
      WHERE attempts.run_id = ? AND attempts.logical_artifact_key = 'chair_synthesis:chair'`)
      .all(runId)
      .map((row) => AcceptedSchema.parse(row));
    const output = accepted
      .flatMap((row) => {
        const envelope = z
          .object({ payload: ChairSynthesisOutputSchema })
          .passthrough()
          .safeParse(parseSafeJson(row.envelope_json));
        return envelope.success ? [envelope.data.payload] : [];
      })
      .at(0);
    const retryPending =
      output === undefined &&
      this.#database
        .prepare(`SELECT 1 FROM jobs WHERE run_id = ?
          AND logical_key = 'chair_synthesis:chair'
          AND status = 'retry-wait' LIMIT 1`)
        .get(runId) !== undefined;
    const incompleteReason =
      output === undefined
        ? retryPending
          ? "retry_pending"
          : receipts.length >= 2
            ? "replacement_exhausted"
            : "chair_artifact_missing"
        : null;
    return {
      runId,
      snapshotId,
      receipts,
      artifactIds: accepted.map((row) => row.artifact_id),
      sectionIds: output?.sections.map((section) => section.sectionId) ?? [],
      characterActorId: output === undefined ? null : "chair",
      publishable:
        output !== undefined &&
        incompleteReason === null &&
        output.sections.length === CHAIR_SECTION_KEYS.length,
      incompleteReason,
    };
  }

  close(): void {
    if (this.#database.open) this.#database.close();
  }
}
