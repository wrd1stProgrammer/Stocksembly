import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { CALL_BUDGET_POLICY } from "../domain/callBudgetContracts";
import { hashCanonical } from "../domain/contractHelpers";
import { ArtifactIdSchema, JobIdSchema, SnapshotIdSchema } from "../domain/ids";
import type { ArtifactCasPort } from "../ports/artifacts";
import { codexInputHash } from "../server/codex/codexRunner";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import { withResearchTransaction } from "../server/persistence/postgres/database";
import { parseSafeJson } from "../server/persistence/postgres/safeJson";
import {
  CHAIR_SECTION_KEYS,
  ChairSynthesisModelOutputSchema,
  type ChairSynthesisReplay,
  ChairSynthesisV3RunnerOutputSchema,
  chairSynthesisV3Prompt,
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

export class ChairSynthesisPostgresAuthority {
  readonly #database: ResearchDatabase;
  constructor(
    database: ResearchDatabase,
    private readonly options: {
      readonly cas: ArtifactCasPort;
      readonly workflowVersion?: "workflow-v2" | "workflow-v3";
    },
  ) {
    this.#database = database;
  }

  async loadJob(runId: string): Promise<PersistedChairJob | undefined> {
    const row = z
      .object({ result_json: z.string() })
      .safeParse(
        (
          await this.#database.query(
            "SELECT result_json FROM idempotency_records WHERE scope = 'chair-synthesis-job' AND idempotency_key = $1",
            [runId],
          )
        ).rows[0],
      );
    return row.success
      ? PersistedChairJobSchema.parse(parseSafeJson(row.data.result_json))
      : undefined;
  }

  async acceptedArtifactId(
    runId: string,
  ): Promise<z.infer<typeof ArtifactIdSchema> | undefined> {
    const row = z.object({ artifact_id: ArtifactIdSchema }).safeParse(
      (
        await this.#database.query(
          `SELECT agent_output_commits.artifact_id
        FROM agent_output_commits JOIN attempts USING(attempt_id)
        WHERE attempts.run_id = $1 AND attempts.logical_artifact_key = 'chair_synthesis:chair'`,
          [runId],
        )
      ).rows[0],
    );
    return row.success ? row.data.artifact_id : undefined;
  }

  async stage(runId: string, at: string): Promise<true | string> {
    const run = RunSchema.safeParse(
      (
        await this.#database.query(
          `SELECT runs.snapshot_id, runs.status,
      snapshots.state AS snapshot_state FROM runs
      JOIN snapshots ON snapshots.snapshot_id = runs.snapshot_id
      WHERE runs.run_id = $1`,
          [runId],
        )
      ).rows[0],
    );
    if (!run.success) return "run_not_ready";
    const prompt = await loadChairPrompt(
      this.#database,
      this.options.cas,
      runId,
    );
    if (prompt === undefined) return "audited_inputs_incomplete";
    const validationPrompt = JSON.stringify(prompt);
    const promptJson =
      this.options.workflowVersion === "workflow-v3"
        ? chairSynthesisV3Prompt({
            sourceLocale: prompt.mandate.locale,
            evidenceCatalog: validationPrompt,
          })
        : chairSynthesisModelPrompt(prompt);
    const inputHash = codexInputHash({
      stage: "chair_synthesis",
      prompt: promptJson,
      outputSchema:
        this.options.workflowVersion === "workflow-v3"
          ? ChairSynthesisV3RunnerOutputSchema
          : ChairSynthesisModelOutputSchema,
    });
    const existing = await this.loadJob(runId);
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
      return await withResearchTransaction(
        this.#database,
        async (transaction) => {
          const updatedJob = (
            await transaction.query(
              `UPDATE jobs SET input_hash = $1
              WHERE job_id = $2 AND run_id = $3
                AND logical_key = 'chair_synthesis:chair'
                AND status IN ('queued', 'retry-wait')
                AND lease_owner IS NULL
                AND NOT EXISTS (SELECT 1 FROM agent_output_commits
                  WHERE agent_output_commits.attempt_id = jobs.attempt_id)`,
              [inputHash, existing.jobId, existing.runId],
            )
          ).rowCount;
          if (updatedJob !== 1) return "chair_input_immutable" as const;
          const refreshed = PersistedChairJobSchema.parse({
            ...existing,
            inputHash,
          });
          const updatedRecord = (
            await transaction.query(
              `UPDATE idempotency_records SET request_hash = $1,
              result_json = $2, created_at = $3
              WHERE scope = 'chair-synthesis-job'
                AND idempotency_key = $4`,
              [inputHash, JSON.stringify(refreshed), at, runId],
            )
          ).rowCount;
          if (updatedRecord !== 1)
            throw new TypeError("chair job refresh was incomplete");
          await transaction.query(
            `UPDATE idempotency_records SET request_hash = $1,
              result_json = (result_json::jsonb || jsonb_build_object('retryAt', $2::text, 'failureCount', 0, 'circuitOpen', false, 'classification', 'transient', 'code', 'schema_contract_refreshed'))::text, created_at = $2
              WHERE scope = 'worker-retry' AND idempotency_key = $3`,
            [inputHash, at, existing.jobId],
          );
          return true as const;
        },
      );
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
    return await withResearchTransaction(
      this.#database,
      async (transaction) => {
        await transaction.query(
          `INSERT INTO jobs(job_id, run_id, snapshot_id, kind,
        logical_key, input_hash, input_manifest_hash, status, created_at)
        VALUES ($1, $2, $3, 'research', $4,
        $5, $6, 'queued', $7)`,
          [
            job.jobId,
            job.runId,
            job.snapshotId,
            job.logicalArtifactId,
            job.inputHash,
            job.inputManifestHash,
            at,
          ],
        );
        await transaction.query(
          `INSERT INTO idempotency_records(scope,
        idempotency_key, request_hash, result_json, created_at)
        VALUES ('chair-synthesis-job', $1, $2, $3, $4)`,
          [job.runId, job.inputHash, JSON.stringify(job), at],
        );
        const bind =
          "INSERT INTO job_input_artifacts(job_id, artifact_id) VALUES ($1, $2)";
        for (const artifactId of job.citableArtifactIds)
          await transaction.query(bind, [job.jobId, artifactId]);
        return true as const;
      },
    );
  }

  async replay(runId: string): Promise<ChairSynthesisReplay> {
    const snapshotId = z
      .object({ snapshot_id: SnapshotIdSchema })
      .parse(
        (
          await this.#database.query(
            "SELECT snapshot_id FROM runs WHERE run_id = $1",
            [runId],
          )
        ).rows[0],
      ).snapshot_id;
    const receipts = (
      await this.#database.query(
        `SELECT research_call_ordinals.ordinal,
      attempts.outcome, CASE WHEN agent_runner_evidence.attempt_id IS NULL THEN 0 ELSE 1 END AS evidence_recorded
      FROM research_call_ordinals JOIN attempts USING(attempt_id)
      LEFT JOIN agent_runner_evidence USING(attempt_id)
      WHERE research_call_ordinals.run_id = $1 AND research_call_ordinals.logical_artifact_key = 'chair_synthesis:chair'
      ORDER BY ordinal`,
        [runId],
      )
    ).rows
      .map((row) => ReceiptSchema.parse(row))
      .map((row) => ({
        ordinal: row.ordinal,
        outcome:
          row.outcome === "failed"
            ? "invalid_schema"
            : (row.outcome ?? "reserved"),
        evidenceRecorded: row.evidence_recorded === 1,
      }));
    const accepted = (
      await this.#database.query(
        `SELECT agent_output_commits.artifact_id,
      agent_output_commits.envelope_json FROM agent_output_commits JOIN attempts USING(attempt_id)
      WHERE attempts.run_id = $1 AND attempts.logical_artifact_key = 'chair_synthesis:chair'`,
        [runId],
      )
    ).rows.map((row) => AcceptedSchema.parse(row));
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
      (
        await this.#database.query(
          `SELECT 1 FROM jobs WHERE run_id = $1
          AND logical_key = 'chair_synthesis:chair'
          AND status = 'retry-wait' LIMIT 1`,
          [runId],
        )
      ).rows[0] !== undefined;
    const incompleteReason =
      output === undefined
        ? retryPending
          ? "retry_pending"
          : receipts.length >= CALL_BUDGET_POLICY.maxAttemptsPerLogicalArtifact
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

  close(): void {}
}
