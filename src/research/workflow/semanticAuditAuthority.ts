import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SemanticAuditOutputSchema } from "../domain/agentOutputs";
import { CALL_BUDGET_POLICY } from "../domain/callBudgetContracts";
import { hashCanonical } from "../domain/contractHelpers";
import { ArtifactIdSchema, JobIdSchema, SnapshotIdSchema } from "../domain/ids";
import { evaluatePublicClaimEligibilityReport } from "../domain/publicClaimEligibility";
import type { ArtifactCasPort } from "../ports/artifacts";
import { codexInputHash } from "../server/codex/codexRunner";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import { withResearchTransaction } from "../server/persistence/postgres/database";
import { parseSafeJson } from "../server/persistence/postgres/safeJson";
import {
  type PersistedSemanticAuditJob,
  PersistedSemanticAuditJobSchema,
  SemanticAuditModelOutputSchema,
  SemanticAuditPromptSchema,
  type SemanticAuditReplay,
  type SemanticAuditStageBlockedReason,
  type SemanticAuditStageInput,
  semanticAuditModelPrompt,
} from "./semanticAuditContracts";
import { loadSemanticAuditJob } from "./semanticAuditJob";
import { loadSemanticPrompt } from "./semanticAuditStructural";

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
const EnvelopeSchema = z
  .object({ payload: SemanticAuditOutputSchema })
  .passthrough();

export function semanticPublicationBlockers(
  materialClaimIds: ReadonlySet<string>,
  claims: readonly {
    readonly claimId: string;
    readonly verdict:
      | "entailed"
      | "partial"
      | "contradicted"
      | "not_assessable";
    readonly contradictionSeverity: "none" | "limited" | "severe";
  }[],
  questionCoverage: readonly {
    readonly questionId: string;
    readonly status: "covered" | "partial" | "uncovered";
  }[],
): readonly string[] {
  void questionCoverage;
  const materialClaims = claims.filter((claim) =>
    materialClaimIds.has(claim.claimId),
  );
  if (materialClaims.length === 0) return [];
  return evaluatePublicClaimEligibilityReport({
    claims: materialClaims.map((claim) => ({
      claimId: claim.claimId,
      kind: "factual_claim",
      materiality: "material",
      semanticVerdict: claim.verdict,
    })),
  }).blockers;
}

export class SemanticAuditPostgresAuthority {
  readonly #database: ResearchDatabase;
  constructor(
    database: ResearchDatabase,
    private readonly options: {
      readonly cas: ArtifactCasPort;
    },
  ) {
    this.#database = database;
  }
  async loadJob(
    runId: string,
    database: ResearchDatabase = this.#database,
  ): Promise<PersistedSemanticAuditJob | undefined> {
    return await loadSemanticAuditJob(database, runId);
  }
  async stage(
    input: SemanticAuditStageInput,
    at: string,
  ): Promise<true | SemanticAuditStageBlockedReason> {
    const run = RunSchema.safeParse(
      (
        await this.#database.query(
          "SELECT runs.snapshot_id, runs.status, snapshots.state AS snapshot_state FROM runs JOIN snapshots ON snapshots.snapshot_id = runs.snapshot_id WHERE runs.run_id = $1",
          [input.runId],
        )
      ).rows[0],
    );
    if (!run.success) return "accepted_workflow_set_incomplete";
    const loaded = await loadSemanticPrompt(
      this.#database,
      this.options.cas,
      input,
      run.data.snapshot_id,
    );
    if (loaded.kind === "blocked") return loaded.reason;
    const prompt = loaded.prompt;
    const sourceArtifactIds = prompt.sourceArtifactIds;
    const request = SemanticAuditPromptSchema.parse(prompt);
    const validationPrompt = JSON.stringify(request);
    const promptJson = semanticAuditModelPrompt(request);
    const inputHash = codexInputHash({
      stage: "semantic_audit",
      prompt: promptJson,
      outputSchema: SemanticAuditModelOutputSchema,
    });
    const requestHash = hashCanonical(input);
    const existing = await this.loadJob(input.runId);
    if (existing !== undefined)
      return existing.requestHash === requestHash
        ? true
        : "claim_set_immutable";
    const citableArtifactIds = [
      input.structuralAuditArtifactId,
      ...sourceArtifactIds,
    ];
    const job = PersistedSemanticAuditJobSchema.parse({
      runId: input.runId,
      snapshotId: run.data.snapshot_id,
      jobId: JobIdSchema.parse(randomUUID()),
      logicalArtifactId: "semantic_audit:system",
      prompt: promptJson,
      validationPrompt,
      inputHash,
      requestHash,
      inputManifestHash: hashCanonical(citableArtifactIds),
      citableArtifactIds,
    });
    return await withResearchTransaction(
      this.#database,
      async (transaction) => {
        await transaction.query(
          "SELECT run_id FROM runs WHERE run_id = $1 FOR UPDATE",
          [input.runId],
        );
        const existing = await this.loadJob(input.runId, transaction);
        if (existing !== undefined)
          return existing.requestHash === requestHash
            ? true
            : "claim_set_immutable";
        await transaction.query(
          "INSERT INTO jobs(job_id, run_id, snapshot_id, kind, logical_key, input_hash, input_manifest_hash, status, created_at) VALUES ($1, $2, $3, 'research', $4, $5, $6, 'queued', $7)",
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
          "INSERT INTO idempotency_records(scope, idempotency_key, request_hash, result_json, created_at) VALUES ('semantic-audit-job', $1, $2, $3, $4)",
          [job.runId, job.inputHash, JSON.stringify(job), at],
        );
        const bind =
          "INSERT INTO job_input_artifacts(job_id, artifact_id) VALUES ($1, $2)";
        for (const artifactId of job.citableArtifactIds)
          await transaction.query(bind, [job.jobId, artifactId]);
        return true;
      },
    );
  }
  async replay(runId: string): Promise<SemanticAuditReplay> {
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
        "SELECT research_call_ordinals.ordinal, attempts.outcome, CASE WHEN agent_runner_evidence.attempt_id IS NULL THEN 0 ELSE 1 END AS evidence_recorded FROM research_call_ordinals JOIN attempts USING (attempt_id) LEFT JOIN agent_runner_evidence USING (attempt_id) WHERE research_call_ordinals.run_id = $1 AND research_call_ordinals.logical_artifact_key = 'semantic_audit:system' ORDER BY ordinal",
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
        "SELECT agent_output_commits.artifact_id, agent_output_commits.envelope_json FROM agent_output_commits JOIN attempts USING (attempt_id) WHERE attempts.run_id = $1 AND attempts.logical_artifact_key = 'semantic_audit:system'",
        [runId],
      )
    ).rows.map((row) =>
      z
        .object({ artifact_id: ArtifactIdSchema, envelope_json: z.string() })
        .parse(row),
    );
    const payload = accepted
      .flatMap((row) => {
        const envelope = EnvelopeSchema.safeParse(
          parseSafeJson(row.envelope_json),
        );
        return envelope.success ? [envelope.data.payload] : [];
      })
      .at(0);
    const request = await this.loadJob(runId);
    const input =
      request === undefined
        ? undefined
        : SemanticAuditPromptSchema.parse(
            JSON.parse(request.validationPrompt ?? request.prompt),
          );
    const material = new Set(
      input?.claims
        .filter((claim) => claim.materiality === "material")
        .map((claim) => claim.claimId) ?? [],
    );
    const claims =
      payload?.verdicts.map((verdict) => ({
        claimId: verdict.claimId,
        verdict: verdict.verdict,
        disposition:
          verdict.verdict === "entailed"
            ? ("verified" as const)
            : verdict.verdict === "partial"
              ? ("partial" as const)
              : verdict.verdict === "contradicted"
                ? ("removed" as const)
                : ("unresolved" as const),
      })) ?? [];
    const questionCoverage =
      payload?.questionCoverage.map((item) => ({
        questionId: item.questionId,
        status: item.status,
      })) ?? [];
    const blockers = semanticPublicationBlockers(
      material,
      payload?.verdicts ?? [],
      questionCoverage,
    );
    const retryPending =
      payload === undefined &&
      (
        await this.#database.query(
          `SELECT 1 FROM jobs WHERE run_id = $1
          AND logical_key = 'semantic_audit:system'
          AND status = 'retry-wait' LIMIT 1`,
          [runId],
        )
      ).rows[0] !== undefined;
    const incompleteReason =
      payload === undefined
        ? retryPending
          ? "retry_pending"
          : receipts.length >= CALL_BUDGET_POLICY.maxAttemptsPerLogicalArtifact
            ? "replacement_exhausted"
            : "semantic_artifact_missing"
        : null;
    return {
      runId,
      snapshotId,
      receipts,
      artifactIds: accepted.map((row) => row.artifact_id),
      claims,
      questionCoverage,
      publishable:
        accepted.length === 1 &&
        incompleteReason === null &&
        blockers.length === 0,
      blockers,
      characterActorId: null,
      drainState: incompleteReason === null ? "ready" : "incomplete",
      incompleteReason,
    };
  }
  close(): void {}
}
