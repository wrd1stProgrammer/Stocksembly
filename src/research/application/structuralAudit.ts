import { hashBytes, hashCanonical } from "../domain/contractHelpers";
import { rightsForSurface } from "../domain/rights";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import {
  type StructuralAuditInput,
  StructuralAuditInputSchema,
  type StructuralMetric,
} from "./structuralAuditContracts";
import { fixedEvidenceSlices } from "./structuralAuditProjection";
import { valueAssertionReproduces } from "./structuralAuditValues";

const GATES = [
  "claim_lineage",
  "exact_span",
  "rights_surface",
  "cutoff_amendment",
  "atomicity",
  "numeric_reproducibility",
  "freshness",
  "opposing_evidence",
  "role_provenance",
  "dissent_retention",
  "open_question_retention",
  "bilingual_parity",
  "capability_exclusion",
  "scenario_safety",
] as const;
type Gate = (typeof GATES)[number];
const SAFE_SCENARIO_FIELDS = new Set([
  "revenue",
  "operating_margin",
  "diluted_eps",
  "valuation_multiple",
]);

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((value) => right.includes(value))
  );
}

function exactSpan(
  input: StructuralAuditInput,
  evidenceId: string,
  locatorHash: string,
): boolean {
  const evidence = input.evidence.find(
    (item) => item.evidenceId === evidenceId,
  );
  if (
    evidence === undefined ||
    evidence.locatorHash !== locatorHash ||
    evidence.span === null
  )
    return false;
  const excerpt = evidence.content.slice(
    evidence.span.start,
    evidence.span.end,
  );
  return (
    hashBytes(evidence.content) === evidence.contentHash &&
    hashBytes(excerpt) === evidence.span.textHash
  );
}

function claimGate(
  input: StructuralAuditInput,
  index: number,
  gate: Gate,
): boolean {
  const candidate = input.claims[index];
  if (candidate === undefined) return false;
  const claim = candidate.claim;
  switch (gate) {
    case "claim_lineage":
      return (
        claim.runId === input.runId &&
        claim.snapshotId === input.snapshotId &&
        [...claim.supportingEvidence, ...claim.opposingEvidence].every(
          (link) => {
            const evidence = input.evidence.find(
              (item) => item.evidenceId === link.evidenceId,
            );
            return (
              evidence?.runId === input.runId &&
              evidence.snapshotId === input.snapshotId
            );
          },
        )
      );
    case "exact_span":
      return (
        claim.supportingEvidence.length > 0 &&
        [...claim.supportingEvidence, ...claim.opposingEvidence].every((link) =>
          exactSpan(input, link.evidenceId, link.locatorHash),
        )
      );
    case "rights_surface":
      return [...claim.supportingEvidence, ...claim.opposingEvidence].every(
        (link) => {
          const evidence = input.evidence.find(
            (item) => item.evidenceId === link.evidenceId,
          );
          return (
            evidence !== undefined &&
            evidence.surface === "model_transfer" &&
            rightsForSurface(evidence.source, evidence.surface).decision ===
              "allowed"
          );
        },
      );
    case "cutoff_amendment":
      return [...claim.supportingEvidence, ...claim.opposingEvidence].every(
        (link) => {
          const evidence = input.evidence.find(
            (item) => item.evidenceId === link.evidenceId,
          );
          if (evidence?.cutoffPolicy === "attempt_fenced_web")
            return (
              evidence.source === "captured_web" &&
              evidence.accession === undefined &&
              evidence.activeAccession === undefined
            );
          return (
            evidence !== undefined &&
            Date.parse(evidence.availableAt) <=
              Date.parse(input.evidenceCutoffAt) &&
            evidence.accession === evidence.activeAccession
          );
        },
      );
    case "atomicity":
      return candidate.atomicFactCount === 1;
    case "numeric_reproducibility":
      return candidate.numericAssertions.every((assertion) => {
        return valueAssertionReproduces(
          input.values,
          assertion,
          input.runId,
          input.snapshotId,
        );
      });
    case "freshness":
      return claim.materiality !== "material" || claim.freshness !== "stale";
    case "opposing_evidence":
      return (
        !candidate.requiresOpposingEvidence || claim.opposingEvidence.length > 0
      );
    case "role_provenance":
      return (
        input.acceptedMemos.length === WORKFLOW_V1_SPECIALIST_IDS.length &&
        WORKFLOW_V1_SPECIALIST_IDS.every((roleId) =>
          input.acceptedMemos.some(
            (memo) =>
              memo.roleId === roleId &&
              memo.runId === input.runId &&
              memo.snapshotId === input.snapshotId,
          ),
        )
      );
    case "dissent_retention":
      return sameSet(
        input.sourceDissentClaimIds,
        input.retainedDissentClaimIds,
      );
    case "open_question_retention":
      return (
        sameSet(
          input.sourceOpenQuestionIds,
          input.sourceOpenQuestions.map((question) => question.questionId),
        ) &&
        sameSet(input.sourceOpenQuestionIds, input.retainedOpenQuestionIds) &&
        sameSet(
          input.retainedOpenQuestionIds,
          input.retainedOpenQuestions.map((question) => question.questionId),
        ) &&
        sameSet(
          input.sourceOpenQuestions.map(hashCanonical),
          input.retainedOpenQuestions.map(hashCanonical),
        )
      );
    case "bilingual_parity":
      return (
        sameSet(input.localizedClaimIds.en, input.localizedClaimIds.ko) &&
        claim.text.en.trim() !== "" &&
        claim.text.ko.trim() !== ""
      );
    case "capability_exclusion":
      return candidate.capabilityFields.every((field) =>
        input.capabilities.some(
          (capability) =>
            capability.key === field.capability &&
            capability.availability === "available",
        ),
      );
    case "scenario_safety":
      return input.scenarios.every((scenario) =>
        SAFE_SCENARIO_FIELDS.has(scenario.field),
      );
  }
}

export function auditStructuralClaims(raw: unknown) {
  const parsed = StructuralAuditInputSchema.parse(raw);
  const seenClaimIds = new Set<string>();
  const input = {
    ...parsed,
    claims: parsed.claims.filter((candidate) => {
      if (seenClaimIds.has(candidate.claim.claimId)) return false;
      seenClaimIds.add(candidate.claim.claimId);
      return true;
    }),
  };
  const metrics: readonly StructuralMetric[] = GATES.map((id) => ({
    id,
    passed: input.claims.filter((_candidate, index) =>
      claimGate(input, index, id),
    ).length,
    denominator: input.claims.length,
  }));
  const blockers = metrics
    .filter((metric) => metric.passed !== metric.denominator)
    .map((metric) => metric.id);
  const claims = deepFreeze(
    input.claims.map((candidate) => ({ ...candidate.claim })),
  );
  const claimSetHash = hashCanonical(
    claims.map((claim) => claim.claimHash).sort(),
  );
  const slices = fixedEvidenceSlices(input);
  const core = {
    runId: input.runId,
    snapshotId: input.snapshotId,
    ...(input.marketSnapshot === undefined
      ? {}
      : { marketSnapshot: input.marketSnapshot }),
    ...(input.metricSnapshot === undefined
      ? {}
      : { metricSnapshot: input.metricSnapshot }),
    metrics,
    blockers,
    claims,
    acceptedRoleIds: input.acceptedMemos.map((memo) => memo.roleId).sort(),
    retainedDissentClaimIds: [...input.retainedDissentClaimIds].sort(),
    retainedOpenQuestionIds: [...input.retainedOpenQuestionIds].sort(),
    retainedOpenQuestions: [...input.retainedOpenQuestions].sort(
      (left, right) => left.questionId.localeCompare(right.questionId),
    ),
    capabilities: input.capabilities,
    scenarios: input.scenarios,
    claimSetHash,
    fixedEvidenceSlices: slices,
    publishable: blockers.length === 0,
  };
  return deepFreeze({ ...core, auditHash: hashCanonical(core) });
}

export const runStructuralAudit = auditStructuralClaims;
