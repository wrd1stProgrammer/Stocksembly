import type Database from "better-sqlite3";
import { z } from "zod";
import {
  type StructuralAuditArtifactEnvelope,
  StructuralAuditArtifactEnvelopeSchema,
} from "../application/structuralAuditPersistenceContracts";
import { hashBytes, hashCanonical } from "../domain/contractHelpers";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { type ArtifactCasPort, ArtifactDigestSchema } from "../ports/artifacts";
import { parseSafeJson } from "../server/persistence/sqlite/safeJson";
import {
  type SemanticAuditPrompt,
  SemanticAuditPromptSchema,
  type SemanticAuditStageBlockedReason,
  type SemanticAuditStageInput,
} from "./semanticAuditContracts";
import { hasSealedWorkflowParents } from "./semanticAuditParents";

const ArtifactRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  content_hash: ArtifactDigestSchema,
  logical_key: z.string(),
  locator_json: z.string().nullable(),
});
type ArtifactRow = z.infer<typeof ArtifactRowSchema>;

type LoadResult =
  | { readonly kind: "loaded"; readonly prompt: SemanticAuditPrompt }
  | {
      readonly kind: "blocked";
      readonly reason: SemanticAuditStageBlockedReason;
    };

const SEMANTIC_EVIDENCE_WINDOW = 1_500;
const SEARCH_STOP_WORDS = new Set([
  "about",
  "after",
  "against",
  "because",
  "between",
  "company",
  "could",
  "current",
  "during",
  "evidence",
  "from",
  "have",
  "into",
  "nvidia",
  "official",
  "remain",
  "than",
  "that",
  "their",
  "these",
  "this",
  "through",
  "under",
  "while",
  "with",
  "would",
]);

function evidenceWindow(
  exactText: string,
  claimText: string,
): { readonly start: number; readonly text: string } {
  if (exactText.length <= SEMANTIC_EVIDENCE_WINDOW)
    return { start: 0, text: exactText };
  const tokens = [
    ...new Set(
      claimText
        .toLowerCase()
        .match(/[a-z0-9][a-z0-9.$%'-]{2,}/gu)
        ?.filter((token) => !SEARCH_STOP_WORDS.has(token)) ?? [],
    ),
  ];
  const lower = exactText.toLowerCase();
  const candidates = new Set([0]);
  for (const token of tokens) {
    let cursor = 0;
    for (let occurrence = 0; occurrence < 8; occurrence += 1) {
      const index = lower.indexOf(token, cursor);
      if (index < 0) break;
      candidates.add(
        Math.max(
          0,
          Math.min(
            exactText.length - SEMANTIC_EVIDENCE_WINDOW,
            index - Math.floor(SEMANTIC_EVIDENCE_WINDOW / 3),
          ),
        ),
      );
      cursor = index + token.length;
    }
  }
  let bestStart = 0;
  let bestScore = -1;
  for (const start of candidates) {
    const window = lower.slice(start, start + SEMANTIC_EVIDENCE_WINDOW);
    const score = tokens.reduce(
      (total, token) =>
        total +
        (window.includes(token)
          ? /\\d|[$%]/u.test(token)
            ? 3
            : 1
          : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }
  return {
    start: bestStart,
    text: exactText.slice(
      bestStart,
      bestStart + SEMANTIC_EVIDENCE_WINDOW,
    ),
  };
}

function decodedJson(value: string): unknown | undefined {
  try {
    return parseSafeJson(value);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function readCas(
  cas: ArtifactCasPort,
  digest: z.infer<typeof ArtifactDigestSchema>,
) {
  try {
    return await cas.get(digest);
  } catch (error) {
    if (error instanceof Error) return undefined;
    throw error;
  }
}

function artifactRow(
  database: Database.Database,
  artifactId: string,
): ArtifactRow | undefined {
  const row = ArtifactRowSchema.safeParse(
    database
      .prepare(`SELECT artifacts.artifact_id, artifacts.run_id,
        artifacts.snapshot_id, artifacts.content_hash, artifacts.logical_key,
        artifact_citation_metadata.locator_json
      FROM artifacts LEFT JOIN artifact_citation_metadata USING (artifact_id)
      WHERE artifacts.artifact_id = ?`)
      .get(artifactId),
  );
  return row.success ? row.data : undefined;
}

function envelopeIntegrity(envelope: StructuralAuditArtifactEnvelope): boolean {
  const result = envelope.result;
  const { auditHash: _auditHash, ...core } = result;
  return (
    envelope.runId === result.runId &&
    envelope.snapshotId === result.snapshotId &&
    envelope.auditHash === result.auditHash &&
    envelope.claimSetHash === result.claimSetHash &&
    envelope.publishable === result.publishable &&
    result.claimSetHash ===
      hashCanonical(result.claims.map((claim) => claim.claimHash).sort()) &&
    result.auditHash === hashCanonical(core)
  );
}

function sliceMatchesClaim(
  envelope: StructuralAuditArtifactEnvelope,
  slice: StructuralAuditArtifactEnvelope["result"]["fixedEvidenceSlices"][number],
): boolean {
  const claim = envelope.result.claims.find(
    (candidate) => candidate.claimId === slice.claimId,
  );
  if (
    claim === undefined ||
    claim.materiality !== "material" ||
    claim.text.en !== slice.text.en ||
    claim.text.ko !== slice.text.ko ||
    slice.evidence.length === 0
  )
    return false;
  return slice.evidence.every((evidence) => {
    const links =
      evidence.relation === "supporting"
        ? claim.supportingEvidence
        : claim.opposingEvidence;
    return links.some(
      (link) =>
        link.evidenceId === evidence.evidenceId &&
        link.locatorHash === evidence.locatorHash,
    );
  });
}

function uniqueClaimsById<
  T extends { readonly claimId: string },
>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.claimId)) return false;
    seen.add(item.claimId);
    return true;
  });
}

async function verifySlice(
  database: Database.Database,
  cas: ArtifactCasPort,
  input: SemanticAuditStageInput,
  snapshotId: string,
  evidence: StructuralAuditArtifactEnvelope["result"]["fixedEvidenceSlices"][number]["evidence"][number],
): Promise<SemanticAuditStageBlockedReason | undefined> {
  const row = artifactRow(database, evidence.artifactId);
  if (row === undefined) return "evidence_artifact_missing";
  if (row.run_id !== input.runId || row.snapshot_id !== snapshotId)
    return "cross_run_or_snapshot_evidence";
  const stored = await readCas(cas, row.content_hash);
  if (
    stored === undefined ||
    hashBytes(stored.bytes) !== row.content_hash ||
    stored.descriptor.artifactId !== row.artifact_id ||
    stored.descriptor.runId !== row.run_id ||
    stored.descriptor.snapshotId !== row.snapshot_id
  )
    return "evidence_content_mismatch";
  if (
    row.locator_json === null ||
    decodedJson(row.locator_json) === undefined ||
    hashCanonical(decodedJson(row.locator_json)) !== evidence.locatorHash
  )
    return "locator_hash_mismatch";
  const content = new TextDecoder().decode(stored.bytes);
  const exact = content.slice(evidence.span.start, evidence.span.end);
  if (
    evidence.span.end <= evidence.span.start ||
    evidence.span.end > content.length ||
    exact !== evidence.exactText ||
    hashBytes(exact) !== evidence.span.textHash
  )
    return "evidence_span_mismatch";
  return undefined;
}

export async function loadSemanticPrompt(
  database: Database.Database,
  cas: ArtifactCasPort,
  input: SemanticAuditStageInput,
  snapshotId: string,
): Promise<LoadResult> {
  const row = artifactRow(database, input.structuralAuditArtifactId);
  if (row === undefined || row.logical_key !== "structural_audit:system")
    return { kind: "blocked", reason: "structural_artifact_missing" };
  if (row.run_id !== input.runId || row.snapshot_id !== snapshotId)
    return { kind: "blocked", reason: "cross_run_or_snapshot_structural" };
  if (
    !hasSealedWorkflowParents(
      database,
      input.structuralAuditArtifactId,
      input.runId,
      snapshotId,
    )
  )
    return { kind: "blocked", reason: "accepted_workflow_set_incomplete" };
  const stored = await readCas(cas, row.content_hash);
  if (
    stored === undefined ||
    hashBytes(stored.bytes) !== row.content_hash ||
    stored.descriptor.artifactId !== row.artifact_id ||
    stored.descriptor.runId !== row.run_id ||
    stored.descriptor.snapshotId !== row.snapshot_id
  )
    return { kind: "blocked", reason: "structural_content_mismatch" };
  const parsed = StructuralAuditArtifactEnvelopeSchema.safeParse(
    decodedJson(new TextDecoder().decode(stored.bytes)),
  );
  if (
    !parsed.success ||
    !parsed.data.publishable ||
    !envelopeIntegrity(parsed.data)
  )
    return { kind: "blocked", reason: "invalid_structural_artifact" };
  const questionIds = input.questions;
  if (
    questionIds.length !== parsed.data.result.retainedOpenQuestionIds.length ||
    new Set(questionIds).size !== questionIds.length ||
    !questionIds.every((id) =>
      parsed.data.result.retainedOpenQuestionIds.includes(id),
    )
  )
    return { kind: "blocked", reason: "claim_set_mismatch" };
  const materialClaims = uniqueClaimsById(
    parsed.data.result.claims.filter(
      (claim) => claim.materiality === "material",
    ),
  );
  const slices = uniqueClaimsById(parsed.data.result.fixedEvidenceSlices);
  if (
    materialClaims.length !== slices.length ||
    !slices.every((slice) => sliceMatchesClaim(parsed.data, slice))
  )
    return { kind: "blocked", reason: "claim_set_mismatch" };
  for (const slice of slices)
    for (const evidence of slice.evidence) {
      const reason = await verifySlice(
        database,
        cas,
        input,
        snapshotId,
        evidence,
      );
      if (reason !== undefined) return { kind: "blocked", reason };
    }
  const boundedSlices = slices.map((slice) => ({
    ...slice,
    evidence: slice.evidence.map((evidence) => {
      const selected = evidenceWindow(evidence.exactText, slice.text.en);
      return {
        ...evidence,
        span: {
          start: evidence.span.start + selected.start,
          end: evidence.span.start + selected.start + selected.text.length,
          textHash: hashBytes(selected.text),
        },
        exactText: selected.text,
      };
    }),
  }));
  const prompt = SemanticAuditPromptSchema.parse({
    kind: "semantic_audit_input_v1",
    structuralAuditHash: parsed.data.auditHash,
    sourceArtifactIds: [
      ...new Set(
        slices.flatMap((slice) =>
          slice.evidence.map((item) => item.artifactId),
        ),
      ),
    ],
    claims: boundedSlices,
    questions: parsed.data.result.retainedOpenQuestions,
  });
  return { kind: "loaded", prompt };
}
