import Database from "better-sqlite3";
import { z } from "zod";
import { StructuralAuditInputSchema } from "../application/structuralAuditContracts";
import { MemoOutputSchema } from "../domain/agentOutputs";
import { createAtomicClaim } from "../domain/claims";
import { hashBytes, hashCanonical } from "../domain/contractHelpers";
import { SourceLocatorSchema } from "../domain/evidenceCoreSchemas";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { buildResearchMetricSnapshot } from "../domain/metricSnapshot";
import type { ArtifactCasPort } from "../ports/artifacts";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { authenticatedWorkflowRetentionRegister } from "../workflow/structuralAuditWorkflowRegister";
import { latestAnnualRevenueValue } from "./officialScenarioValue";

const SnapshotRowSchema = z.object({
  snapshot_id: SnapshotIdSchema,
  requested_at: z.string().datetime(),
  evidence_cutoff_at: z.string().datetime(),
});

const ArtifactRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  logical_key: z.string().min(1),
  content_hash: ArtifactDigestSchema,
  created_at: z.string().datetime(),
  locator_json: z.string().optional(),
});
const EvidenceArtifactRowSchema = ArtifactRowSchema.extend({
  cutoff_policy: z.enum(["snapshot", "attempt_fenced_web"]),
});

const MemoEnvelopeSchema = z.object({
  payload: MemoOutputSchema,
});
const ProviderLedgerSchema = z
  .object({
    familyStates: z.record(
      z.string(),
      z.object({ status: z.string(), limitation: z.string().optional() }),
    ),
  })
  .passthrough();
const ProviderQuoteSchema = z
  .object({
    providerCode: z.string().trim().min(1),
    marketState: z.enum(["OPEN", "CLOSED", "PRE", "POST", "HOLIDAYS"]),
    observedAt: z.string().datetime(),
    lastPrice: z.number().positive(),
    change: z.number().finite().optional(),
    changePercent: z.number().finite().optional(),
    currency: z.string().trim().min(3).max(8),
  })
  .passthrough();

type EvidenceRecord = {
  readonly evidenceId: string;
  readonly artifactId: string;
  readonly locatorHash: string;
};

function sourceTimes(
  locator: z.infer<typeof SourceLocatorSchema>,
  requestedAt: string,
  evidenceCutoffAt: string,
  retrievedAt: string,
) {
  if (locator.kind === "sec_filing")
    return {
      retrievedAt: evidenceCutoffAt,
      availableAt: locator.acceptedAt,
      accession: locator.accession,
      activeAccession: locator.accession,
    };
  if (locator.kind === "licensed_provider" || locator.kind === "market")
    return {
      retrievedAt: evidenceCutoffAt,
      availableAt: evidenceCutoffAt,
    };
  return {
    retrievedAt,
    availableAt: locator.kind === "captured_web" ? retrievedAt : requestedAt,
  };
}

function workflowRows(database: Database.Database, runId: string) {
  return database
    .prepare(`SELECT artifacts.artifact_id, artifacts.logical_key,
      artifacts.content_hash, artifacts.created_at
    FROM artifacts
    WHERE artifacts.run_id = ? AND (
      artifacts.logical_key LIKE 'memo:%' OR
      artifacts.logical_key LIKE 'consolidation:%' OR
      artifacts.logical_key LIKE 'challenge:%' OR
      artifacts.logical_key LIKE 'response_ballot:%')
    ORDER BY artifacts.logical_key`)
    .all(runId)
    .map((row) => ArtifactRowSchema.parse(row));
}

export async function buildOfficialStructuralAuditInput(options: {
  readonly databasePath: string;
  readonly cas: ArtifactCasPort;
  readonly runId: string;
}) {
  const runId = RunIdSchema.parse(options.runId);
  const database = new Database(options.databasePath, { readonly: true });
  database.pragma("foreign_keys = ON");
  try {
    const snapshot = SnapshotRowSchema.parse(
      database
        .prepare(`SELECT snapshots.snapshot_id, snapshots.requested_at,
          snapshots.evidence_cutoff_at FROM runs
        JOIN snapshots ON snapshots.snapshot_id = runs.snapshot_id
        WHERE runs.run_id = ? AND snapshots.state = 'sealed'`)
        .get(runId),
    );
    const accepted = workflowRows(database, runId);
    const retention = await authenticatedWorkflowRetentionRegister(
      options.cas,
      accepted.map((row) => ({
        artifactId: row.artifact_id,
        logicalArtifactKey: row.logical_key,
        contentHash: row.content_hash,
      })),
      runId,
      snapshot.snapshot_id,
    );
    if (retention === undefined)
      throw new TypeError("accepted workflow artifacts failed authentication");

    const evidenceRows = database
      .prepare(`SELECT DISTINCT artifacts.artifact_id, artifacts.logical_key,
        artifacts.content_hash, artifacts.created_at,
        artifact_citation_metadata.locator_json,
        CASE WHEN EXISTS (
          SELECT 1 FROM attempt_web_evidence
          JOIN agent_runner_evidence USING (attempt_id)
          JOIN attempts USING (attempt_id)
          JOIN agent_output_commits USING (attempt_id)
          JOIN artifact_edges AS committed_edge
            ON committed_edge.child_artifact_id =
              agent_output_commits.artifact_id
           AND committed_edge.parent_artifact_id =
              attempt_web_evidence.artifact_id
           AND committed_edge.relation = 'cites'
          WHERE attempt_web_evidence.artifact_id = artifacts.artifact_id
            AND attempt_web_evidence.tool_transcript_hash =
              agent_runner_evidence.tool_transcript_hash
            AND attempts.run_id = artifacts.run_id
            AND attempts.snapshot_id = artifacts.snapshot_id
            AND attempts.status = 'succeeded'
        ) THEN 'attempt_fenced_web' ELSE 'snapshot' END AS cutoff_policy
      FROM artifacts JOIN artifact_citation_metadata USING (artifact_id)
      WHERE artifacts.run_id = ? AND (
        artifacts.logical_key LIKE 'evidence:%' OR artifacts.artifact_id IN (
          SELECT artifact_edges.parent_artifact_id FROM artifact_edges
          JOIN artifacts AS child
            ON child.artifact_id = artifact_edges.child_artifact_id
          WHERE child.run_id = ? AND child.logical_key LIKE 'memo:%'
            AND artifact_edges.relation = 'cites'
        )
      )
      ORDER BY artifacts.logical_key`)
      .all(runId, runId)
      .map((row) => EvidenceArtifactRowSchema.parse(row));
    const evidenceRecords = new Map<string, EvidenceRecord>();
    const evidence = [];
    let annualRevenue: string | undefined;
    let marketEvidenceAvailable = false;
    let providerEvidenceAvailable = false;
    let providerFundamentals: unknown;
    let providerPeers: unknown;
    let providerQuote: unknown;
    let marketSnapshot: z.infer<typeof ProviderQuoteSchema> | undefined;
    for (const row of evidenceRows) {
      const stored = await options.cas.get(row.content_hash);
      if (stored === undefined || row.locator_json === undefined)
        throw new TypeError("sealed evidence artifact is missing");
      const locator = SourceLocatorSchema.parse(JSON.parse(row.locator_json));
      if (
        locator.kind === "market" ||
        (locator.kind === "licensed_provider" &&
          ["market_bars", "insightsentry_quote"].includes(locator.dataset))
      )
        marketEvidenceAvailable = true;
      const content = new TextDecoder().decode(stored.bytes);
      let decodedContent: unknown;
      if (locator.kind === "licensed_provider")
        try {
          decodedContent = JSON.parse(content);
        } catch {
          decodedContent = undefined;
        }
      if (
        locator.kind === "licensed_provider" &&
        locator.dataset === "insightsentry_quote"
      ) {
        providerQuote = decodedContent;
        const quote = ProviderQuoteSchema.safeParse(decodedContent);
        if (quote.success) marketSnapshot = quote.data;
      } else if (
        locator.kind === "licensed_provider" &&
        locator.dataset === "insightsentry_fundamentals"
      ) {
        providerFundamentals = decodedContent;
      } else if (
        locator.kind === "licensed_provider" &&
        locator.dataset === "insightsentry_peers"
      ) {
        providerPeers = decodedContent;
      }
      if (locator.kind === "licensed_provider") {
        if (locator.dataset === "insightsentry_request_ledger") {
          const ledger = ProviderLedgerSchema.safeParse(decodedContent);
          providerEvidenceAvailable =
            providerEvidenceAvailable ||
            (ledger.success &&
              Object.values(ledger.data.familyStates).some(
                (state) => state.status === "available",
              ));
        } else {
          providerEvidenceAvailable = true;
        }
      }
      annualRevenue ??= latestAnnualRevenueValue(content);
      const evidenceId = row.logical_key.replace(/^evidence:/, "");
      const locatorHash = hashCanonical(locator);
      evidenceRecords.set(row.artifact_id, {
        evidenceId,
        artifactId: row.artifact_id,
        locatorHash,
      });
      evidence.push({
        evidenceId,
        artifactId: row.artifact_id,
        runId,
        snapshotId: snapshot.snapshot_id,
        source: locator.source,
        surface: "model_transfer" as const,
        locatorHash,
        content,
        contentHash: hashBytes(content),
        cutoffPolicy: row.cutoff_policy,
        span: {
          start: 0,
          end: content.length,
          textHash: hashBytes(content),
        },
        ...sourceTimes(
          locator,
          snapshot.requested_at,
          snapshot.evidence_cutoff_at,
          row.created_at,
        ),
      });
    }

    const claims = [];
    for (const row of accepted.filter((item) =>
      item.logical_key.startsWith("memo:"),
    )) {
      const stored = await options.cas.get(row.content_hash);
      if (stored === undefined)
        throw new TypeError("accepted memo artifact is missing");
      const envelope = MemoEnvelopeSchema.parse(
        JSON.parse(new TextDecoder().decode(stored.bytes)),
      );
      for (const position of envelope.payload.positions) {
        const links = position.evidenceArtifactIds.flatMap((artifactId) => {
          const source = evidenceRecords.get(artifactId);
          return source === undefined
            ? []
            : [
                {
                  evidenceId: source.evidenceId,
                  locatorHash: source.locatorHash,
                },
              ];
        });
        if (links.length === 0) continue;
        const claim = createAtomicClaim({
          claimId: position.claimId,
          runId,
          snapshotId: snapshot.snapshot_id,
          text: position.publicSummary,
          epistemicClass: "interpretation",
          stance:
            position.stance === "supports"
              ? "positive"
              : position.stance === "opposes"
                ? "caution"
                : "mixed",
          materiality: "material",
          claimType: row.logical_key.replace(/^memo:/, ""),
          supportingEvidence: links,
          opposingEvidence: [],
          asOf: snapshot.evidence_cutoff_at,
          freshness: "fresh",
          uncertainty: position.stance === "uncertain" ? "high" : "medium",
          ...(position.falsifier === undefined
            ? {}
            : {
                changeCondition: {
                  en: position.falsifier.en,
                  ko: position.falsifier.ko,
                  triggerEvidenceIds: links.map((link) => link.evidenceId),
                },
              }),
        });
        claims.push({
          claim,
          atomicFactCount: 1,
          requiresOpposingEvidence: false,
          numericAssertions: [],
          capabilityFields: [],
        });
      }
    }
    if (claims.length === 0)
      throw new TypeError("no evidence-linked specialist claims were found");
    const claimIds = [
      ...new Set(claims.map((candidate) => candidate.claim.claimId)),
    ];
    const retainedDissentClaimIds = retention.dissentClaimIds.filter(
      (claimId) => claimIds.includes(claimId),
    );
    const metricSnapshot = buildResearchMetricSnapshot({
      asOf: snapshot.evidence_cutoff_at,
      quote: providerQuote,
      fundamentals: providerFundamentals,
      peers: providerPeers,
    });
    return StructuralAuditInputSchema.parse({
      runId,
      snapshotId: snapshot.snapshot_id,
      evidenceCutoffAt: snapshot.evidence_cutoff_at,
      ...(marketSnapshot === undefined ? {} : { marketSnapshot }),
      ...(metricSnapshot === undefined ? {} : { metricSnapshot }),
      claims,
      evidence,
      values: { runId, snapshotId: snapshot.snapshot_id, records: [] },
      acceptedMemos: [],
      sourceDissentClaimIds: retainedDissentClaimIds,
      retainedDissentClaimIds,
      sourceOpenQuestionIds: retention.openQuestions.map(
        (question) => question.questionId,
      ),
      retainedOpenQuestionIds: retention.openQuestions.map(
        (question) => question.questionId,
      ),
      sourceOpenQuestions: retention.openQuestions,
      retainedOpenQuestions: retention.openQuestions,
      localizedClaimIds: { en: claimIds, ko: claimIds },
      capabilities: [
        { key: "sec_filings", availability: "available" },
        { key: "sec_company_facts", availability: "available" },
        { key: "bls_macro", availability: "available" },
        { key: "treasury_yield", availability: "available" },
        {
          key: "current_market_data",
          availability: marketEvidenceAvailable ? "available" : "unavailable",
        },
        {
          key: "insightsentry_provider",
          availability: providerEvidenceAvailable ? "available" : "unavailable",
        },
      ],
      scenarios: [
        {
          field: "revenue",
          value:
            annualRevenue ??
            "Annual SEC revenue was not available in the sealed snapshot; retain a qualitative scenario and disclose the limitation.",
        },
      ],
    });
  } finally {
    database.close();
  }
}
