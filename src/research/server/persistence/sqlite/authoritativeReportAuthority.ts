import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { z } from "zod";
import type { PublishAuthoritativeReportInput } from "../../../application/authoritativeReportPublisherContracts";
import { StructuralAuditArtifactEnvelopeSchema } from "../../../application/structuralAuditPersistenceContracts";
import {
  AtomicEditorialClaimSchema,
  ChairSynthesisOutputSchema,
  MemoOutputSchema,
  SemanticAuditOutputSchema,
} from "../../../domain/agentOutputs";
import {
  canonicalJson,
  hashBytes,
  hashCanonical,
} from "../../../domain/contractHelpers";
import { REQUIRED_REPORT_ARTIFACT_ROLES } from "../../../domain/reportArtifactProvenance";
import { normalizeResearchDirection } from "../../../domain/researchDirection";
import { qualifyInsightSentryPeers } from "../../../domain/qualifyInsightSentryPeers";
import { WORKFLOW_V1_DEPARTMENT_IDS } from "../../../domain/roleRegistry";
import type { ArtifactCasPort } from "../../../ports/artifacts";
import type {
  ResearchReport,
  WorkflowV2ResearchReport,
} from "../../../domain/report";
import { ArtifactDigestSchema } from "../../../ports/artifacts";
import { loadChairPrompt } from "../../../workflow/chairSynthesisInput";
import {
  AuthoritativeRunSchema,
  reportRoleFor,
} from "./authoritativeReportAuthorityContracts";
import { loadAuthenticatedReportSources } from "./authoritativeReportSources";

const RowSchema = z.object({
  artifact_id: z.string().uuid(),
  run_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
  content_hash: ArtifactDigestSchema,
  logical_key: z.string(),
  attempt_id: z.string().uuid().nullable(),
  job_id: z.string().uuid().nullable(),
  ordinal: z.number().int().positive().nullable(),
  owner_id: z.string().nullable(),
  fence_token: z.number().int().positive().nullable(),
  envelope_json: z.string().nullable(),
});
const EnvelopeSchema = z
  .object({
    runId: z.string().uuid(),
    snapshotId: z.string().uuid(),
    jobId: z.string().uuid(),
    attemptId: z.string().uuid(),
    ordinal: z.number().int().positive(),
    logicalArtifactId: z.string(),
    roleId: z.string(),
    stage: z.string(),
    outputHash: z.string().regex(/^[a-f0-9]{64}$/),
    payload: z.unknown(),
  })
  .passthrough();

function blocked(reason: string): undefined {
  process.stderr.write(
    `${JSON.stringify({ kind: "report_authority_blocked", reason })}\n`,
  );
  return undefined;
}

async function authenticatedJson(
  cas: ArtifactCasPort,
  row: z.infer<typeof RowSchema>,
) {
  const stored = await cas.get(row.content_hash);
  if (
    stored === undefined ||
    stored.descriptor.artifactId !== row.artifact_id ||
    stored.descriptor.runId !== row.run_id ||
    stored.descriptor.snapshotId !== row.snapshot_id ||
    hashBytes(stored.bytes) !== row.content_hash
  )
    return undefined;
  const parsed: unknown = JSON.parse(new TextDecoder().decode(stored.bytes));
  return { parsed, canonical: canonicalJson(parsed) };
}

export async function loadReportAuthority(
  databasePath: string,
  cas: ArtifactCasPort,
  input: PublishAuthoritativeReportInput,
  revision?: Readonly<{
    reportId: string;
    reportArtifactId: string;
    versionId: string;
    version: number;
    priorReport: ResearchReport | WorkflowV2ResearchReport;
    expectedStatus: "completed" | "complete-with-limitations";
  }>,
) {
  const database = new Database(databasePath, { readonly: true });
  try {
    const runRow = database
      .prepare(`SELECT snapshot_id,
      version, status, report_id,
      COALESCE(research_requests.question, '') AS question,
      research_requests.locale AS locale FROM runs
      LEFT JOIN research_requests USING(run_id) WHERE run_id = ?`)
      .get(input.runId);
    const run =
      revision === undefined
        ? AuthoritativeRunSchema.safeParse(runRow)
        : z
            .object({
              snapshot_id: z.string().uuid(),
              version: z.number().int().nonnegative(),
              status: z.literal(revision.expectedStatus),
              report_id: z.literal(revision.reportId),
              question: z.string(),
              locale: z.enum(["en", "ko"]),
            })
            .safeParse(runRow);
    if (!run.success) return blocked("run_not_publishable");
    const rows = database
      .prepare(`SELECT artifacts.artifact_id, artifacts.run_id,
      artifacts.snapshot_id, artifacts.content_hash, artifacts.logical_key,
      attempts.attempt_id, attempts.job_id, agent_output_commits.ordinal,
      agent_output_commits.owner_id, agent_output_commits.fence_token,
      agent_output_commits.envelope_json FROM artifacts
      LEFT JOIN agent_output_commits USING(artifact_id)
      LEFT JOIN attempts USING(attempt_id) WHERE artifacts.run_id = ?`)
      .all(input.runId)
      .map((row) => RowSchema.parse(row));
    const structuralRow = rows.find(
      (row) => row.logical_key === "structural_audit:system",
    );
    const semanticRow = rows.find(
      (row) => row.logical_key === "semantic_audit:system",
    );
    const chairRow = rows.find(
      (row) => row.logical_key === "chair_synthesis:chair",
    );
    if (
      structuralRow === undefined ||
      semanticRow === undefined ||
      chairRow === undefined
    )
      return blocked("required_audit_or_chair_missing");
    if (
      chairRow.artifact_id !== input.acceptedChairArtifactId ||
      chairRow.job_id !== input.fence.jobId ||
      chairRow.attempt_id !== input.fence.attemptId ||
      chairRow.ordinal !== input.fence.ordinal ||
      chairRow.owner_id !== input.fence.ownerId ||
      chairRow.fence_token !== input.fence.token
    )
      return blocked("chair_fence_mismatch");
    const reportRows = rows.filter(
      (row) => reportRoleFor(row.logical_key) !== undefined,
    );
    if (reportRows.length !== REQUIRED_REPORT_ARTIFACT_ROLES.length)
      return blocked("report_role_set_incomplete");
    const loaded = await Promise.all(
      [
        structuralRow,
        semanticRow,
        chairRow,
        ...reportRows.filter((row) => row !== chairRow),
      ].map(async (row) => ({
        row,
        content: await authenticatedJson(cas, row),
      })),
    );
    if (loaded.some((entry) => entry.content === undefined))
      return blocked("artifact_authentication_failed");
    const structuralContent = loaded.find(
      (entry) => entry.row === structuralRow,
    )?.content;
    const structural = StructuralAuditArtifactEnvelopeSchema.safeParse(
      structuralContent?.parsed,
    );
    if (!structural.success || !structural.data.publishable)
      return blocked("structural_audit_invalid");
    const envelopes = new Map<string, z.infer<typeof EnvelopeSchema>>();
    for (const row of [
      semanticRow,
      chairRow,
      ...reportRows.filter((entry) => entry !== chairRow),
    ]) {
      const content = loaded.find((entry) => entry.row === row)?.content;
      const envelope = EnvelopeSchema.safeParse(content?.parsed);
      if (
        !envelope.success ||
        row.envelope_json === null ||
        content?.canonical !== canonicalJson(JSON.parse(row.envelope_json)) ||
        envelope.data.runId !== input.runId ||
        envelope.data.snapshotId !== run.data.snapshot_id ||
        envelope.data.logicalArtifactId !== row.logical_key ||
        hashCanonical(envelope.data.payload) !== envelope.data.outputHash
      )
        return blocked(`agent_envelope_invalid:${row.logical_key}`);
      envelopes.set(row.logical_key, envelope.data);
    }
    const semantic = SemanticAuditOutputSchema.safeParse(
      envelopes.get("semantic_audit:system")?.payload,
    );
    const chair = ChairSynthesisOutputSchema.safeParse(
      envelopes.get("chair_synthesis:chair")?.payload,
    );
    const prompt = await loadChairPrompt(database, cas, input.runId);
    if (!semantic.success || !chair.success || prompt === undefined)
      return blocked("semantic_chair_or_prompt_invalid");
    const peerRow = rows.find(
      (row) => row.logical_key === "evidence:insightsentry:peers",
    );
    const peerContent =
      peerRow === undefined ? undefined : await authenticatedJson(cas, peerRow);
    const comparatorQualification =
      peerRow === undefined || peerContent === undefined
        ? undefined
        : qualifyInsightSentryPeers({
            rawPeerArtifactId: peerRow.artifact_id,
            peers: peerContent.parsed,
          });
    const comparators =
      comparatorQualification?.status !== "qualified"
        ? []
        : comparatorQualification.rows
            .filter((row) => row.displayEligibility)
            .map((row) => ({
              comparatorId: row.comparatorId,
              role: row.role,
              rationale: row.rationale,
              comparableMetricKeys: row.comparableMetricKeys,
            }));
    const teamViews = WORKFLOW_V1_DEPARTMENT_IDS.flatMap((departmentId) => {
      const position = prompt.sentences.find(
        (sentence) => sentence.sentenceId === `position:${departmentId}`,
      );
      const ballot = prompt.ballots.find(
        (candidate) => candidate.departmentId === departmentId,
      );
      const rationale = prompt.sentences.find(
        (sentence) => sentence.sentenceId === `ballot:${departmentId}`,
      );
      return position === undefined ||
        ballot === undefined ||
        rationale === undefined
        ? []
        : [
            {
              departmentId,
              position: position.text,
              vote: ballot.vote,
              rationale: rationale.text,
            },
          ];
    });
    if (teamViews.length !== WORKFLOW_V1_DEPARTMENT_IDS.length)
      return blocked("team_view_set_incomplete");
    const slices = structural.data.result.fixedEvidenceSlices.flatMap(
      (entry) => entry.evidence,
    );
    const sourceIds = new Set([
      ...slices.map((slice) => slice.artifactId),
      ...prompt.sentences.flatMap((sentence) => sentence.sourceArtifactIds),
      ...rows
        .filter(
          (row) => row.logical_key === "evidence:insightsentry:request-ledger",
        )
        .map((row) => row.artifact_id),
    ]);
    const authenticatedSources = await loadAuthenticatedReportSources(
      database,
      cas,
      input.runId,
      sourceIds,
      slices,
    );
    if (authenticatedSources === undefined)
      return blocked("report_source_authentication_failed");
    const materiality = new Map(
      structural.data.result.claims.map((claim) => [
        claim.claimId,
        claim.materiality,
      ]),
    );
    const versionId = revision?.versionId ?? randomUUID();
    const editorialClaims = [...envelopes.entries()].flatMap(
      ([logicalKey, envelope]) => {
        if (!logicalKey.startsWith("memo:")) return [];
        const memo = MemoOutputSchema.safeParse(envelope.payload);
        if (!memo.success) return [];
        return memo.data.positions.flatMap((position) => {
          if (
            position.decisionDimension === undefined ||
            position.roleOwner === undefined ||
            position.materiality === undefined ||
            position.falsifier === undefined
          )
            return [];
          const parsed = AtomicEditorialClaimSchema.safeParse({
            claimId: position.claimId,
            decisionDimension: position.decisionDimension,
            roleOwner: position.roleOwner,
            stanceContribution:
              position.stance === "supports"
                ? "supports"
                : position.stance === "opposes"
                  ? "opposes"
                  : "uncertain",
            materiality: position.materiality,
            publicThesis: position.publicSummary,
            evidenceArtifactIds: position.evidenceArtifactIds,
            counterevidenceArtifactIds: [],
            decisiveMetricIds: position.decisiveMetricIds ?? [],
            falsifier: position.falsifier,
          });
          return parsed.success ? [parsed.data] : [];
        });
      },
    );
    return {
      locale: run.data.locale,
      runVersion: run.data.version,
      reportId: revision?.reportId ?? randomUUID(),
      reportArtifactId: revision?.reportArtifactId ?? randomUUID(),
      versionId,
      version: revision?.version ?? 1,
      ...(revision === undefined ? {} : { priorReport: revision.priorReport }),
      ...(normalizeResearchDirection(run.data.question) === undefined
        ? {}
        : { researchDirection: normalizeResearchDirection(run.data.question) }),
      teamViews,
      artifacts: reportRows.map((row) => {
        const roleId = reportRoleFor(row.logical_key);
        if (roleId === undefined) throw new TypeError("unknown report role");
        return {
          artifactId: row.artifact_id,
          logicalArtifactId: row.logical_key,
          roleId,
          stage:
            roleId === "chair"
              ? ("chair_synthesis" as const)
              : ("memo" as const),
          status: "accepted" as const,
          runId: row.run_id,
          snapshotId: row.snapshot_id,
        };
      }),
      authenticatedSources,
      parentArtifacts: [structuralRow, semanticRow, ...reportRows].map(
        (row) => ({
          artifactId: row.artifact_id,
          digest: row.content_hash,
        }),
      ),
      structuralAuditArtifactId: structuralRow.artifact_id,
      structuralAudit: structural.data,
      semanticAudit: {
        schemaVersion: "workflow-v1" as const,
        artifactId: semanticRow.artifact_id,
        runId: input.runId,
        snapshotId: run.data.snapshot_id,
        reportVersionId: versionId,
        verdicts: semantic.data.verdicts.map((verdict) => ({
          claimId: verdict.claimId,
          materiality:
            materiality.get(verdict.claimId) ?? ("supporting" as const),
          verdict: verdict.verdict,
          contradictionSeverity: verdict.contradictionSeverity,
          reason: verdict.publicExplanation[run.data.locale],
        })),
        metrics: [
          {
            id: "semantic_claim_admissibility",
            passed: semantic.data.verdicts.filter(
              (verdict) => verdict.verdict !== "contradicted",
            ).length,
            denominator: semantic.data.verdicts.filter(
              (verdict) => verdict.verdict !== "contradicted",
            ).length,
          },
        ],
      },
      chair: chair.data,
      chairScenarioIds: prompt.scenarioIds,
      chairSentences: prompt.sentences,
      researchProfile: prompt.mandate.researchProfile,
      ...(comparators.length === 0 ? {} : { comparators }),
      ...(editorialClaims.length === 0 ? {} : { editorialClaims }),
    };
  } finally {
    database.close();
  }
}
