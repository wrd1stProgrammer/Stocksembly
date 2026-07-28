import { createAtomicClaim } from "../domain/claims";
import { hashBytes, hashCanonical } from "../domain/contractHelpers";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import {
  createValueRegistry,
  deriveValue,
  registerValue,
} from "../domain/valueRegistry";

const RUN_ID = "00000000-0000-4000-8000-000000000001";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000002";
const REPORT_ID = "00000000-0000-4000-8000-000000000003";
const CLAIM_ID = "00000000-0000-4000-8000-000000000004";
const QUESTION_ID = "00000000-0000-4000-8000-000000000006";
const ARTIFACT_ID = "00000000-0000-4000-8000-000000000005";
const CUTOFF = "2026-01-31T00:00:00.000Z";
const CONTENT = "Revenue was 100. Contrary evidence remained material.";
const LOCATOR_HASH = hashCanonical({ accession: "0000000000-26-000001" });

export type StructuralFault =
  | "none"
  | "cross_run"
  | "missing_span"
  | "surface_mismatch"
  | "rights_withheld"
  | "future_accession"
  | "superseded_accession"
  | "non_atomic"
  | "wrong_decimal"
  | "wrong_parent_hash"
  | "stale_material"
  | "missing_opposition"
  | "opposing_span_mismatch"
  | "missing_min"
  | "dissent_dropped"
  | "question_dropped"
  | "korean_only"
  | "capability_field"
  | "target_price"
  | "unknown_scenario_field";

function valueRegistry(fault: StructuralFault) {
  let registry = createValueRegistry({
    runId: RUN_ID,
    snapshotId: SNAPSHOT_ID,
  });
  const first = registerValue(registry, {
    valueId: "revenue",
    runId: RUN_ID,
    snapshotId: SNAPSHOT_ID,
    metric: "revenue",
    value: "100",
    unit: "USD",
    source: "bls_allowlist",
    period: "2025",
    evidenceCutoffAt: CUTOFF,
  });
  registry = first.registry;
  const second = registerValue(registry, {
    valueId: "prior-revenue",
    runId: RUN_ID,
    snapshotId: SNAPSHOT_ID,
    metric: "revenue",
    value: "50",
    unit: "USD",
    source: "bls_allowlist",
    period: "2024",
    evidenceCutoffAt: CUTOFF,
  });
  registry = second.registry;
  const derived = deriveValue(registry, {
    valueId: "growth-percent",
    metric: "growth",
    unit: "percent",
    period: "2025",
    operation: "divide_percent",
    numeratorValueId: "revenue",
    denominatorValueId: "prior-revenue",
  }).registry;
  if (fault !== "wrong_parent_hash") return derived;
  return {
    ...derived,
    records: derived.records.map((record) => {
      if (record.valueId !== "growth-percent") return record;
      const altered = {
        ...record,
        parentHashes: ["f".repeat(64), record.parentHashes[1]],
      };
      const { hash: _hash, ...hashable } = altered;
      return { ...hashable, hash: hashCanonical(hashable) };
    }),
  };
}

export function makeStructuralAuditInput(fault: StructuralFault) {
  const evidence = {
    evidenceId: "filing-span",
    artifactId: ARTIFACT_ID,
    runId:
      fault === "cross_run" ? "00000000-0000-4000-8000-000000000099" : RUN_ID,
    snapshotId: SNAPSHOT_ID,
    source: fault === "rights_withheld" ? "sec_exhibit" : "sec_primary_filing",
    surface: fault === "surface_mismatch" ? "export" : "model_transfer",
    locatorHash: LOCATOR_HASH,
    content: CONTENT,
    contentHash: hashBytes(CONTENT),
    span:
      fault === "missing_span"
        ? null
        : { start: 0, end: 16, textHash: hashBytes(CONTENT.slice(0, 16)) },
    retrievedAt: "2026-01-20T00:00:00.000Z",
    availableAt:
      fault === "future_accession"
        ? "2026-02-01T00:00:00.000Z"
        : "2026-01-20T00:00:00.000Z",
    accession: "0000000000-26-000001",
    activeAccession:
      fault === "superseded_accession"
        ? "0000000000-26-000002"
        : "0000000000-26-000001",
  };
  const opposingEvidence =
    fault === "missing_opposition"
      ? []
      : [
          {
            evidenceId: "filing-span",
            locatorHash:
              fault === "opposing_span_mismatch"
                ? "b".repeat(64)
                : LOCATOR_HASH,
            reason: "Material counterpoint",
          },
        ];
  const claim = createAtomicClaim({
    claimId: CLAIM_ID,
    runId: RUN_ID,
    snapshotId: SNAPSHOT_ID,
    reportVersionId: REPORT_ID,
    text: { en: "Revenue doubled.", ko: "매출은 두 배가 되었습니다." },
    epistemicClass: "interpretation",
    stance: "mixed",
    materiality: "material",
    claimType: "operating_performance",
    supportingEvidence: [
      {
        evidenceId: "filing-span",
        locatorHash: LOCATOR_HASH,
        valueId: "growth-percent",
      },
    ],
    opposingEvidence,
    asOf: "2026-01-20T00:00:00.000Z",
    freshness: fault === "stale_material" ? "stale" : "fresh",
    uncertainty: "medium",
    changeCondition: {
      en: "A later filing changes the registered value.",
      ko: "후속 공시가 등록 값을 변경합니다.",
      triggerEvidenceIds: ["filing-span"],
    },
  });
  const memoRoles = WORKFLOW_V1_SPECIALIST_IDS.filter(
    (roleId) => fault !== "missing_min" || roleId !== "risk_policy",
  );
  return {
    runId: RUN_ID,
    snapshotId: SNAPSHOT_ID,
    evidenceCutoffAt: CUTOFF,
    claims: [
      {
        claim,
        atomicFactCount: fault === "non_atomic" ? 2 : 1,
        requiresOpposingEvidence: true,
        numericAssertions: [
          {
            valueId: "growth-percent",
            renderedValue: fault === "wrong_decimal" ? "201" : "200",
          },
        ],
        capabilityFields:
          fault === "capability_field"
            ? [{ capability: "market_price", field: "current_price" }]
            : [],
      },
    ],
    evidence: [evidence],
    values: valueRegistry(fault),
    acceptedMemos: memoRoles.map((roleId, index) => ({
      roleId,
      artifactId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
    })),
    sourceDissentClaimIds: [CLAIM_ID],
    retainedDissentClaimIds: fault === "dissent_dropped" ? [] : [CLAIM_ID],
    sourceOpenQuestionIds: [QUESTION_ID],
    retainedOpenQuestionIds: fault === "question_dropped" ? [] : [QUESTION_ID],
    sourceOpenQuestions: [
      {
        questionId: QUESTION_ID,
        text: {
          en: "Which evidence would change the risk conclusion?",
          ko: "어떤 증거가 위험 결론을 바꿀 수 있습니까?",
        },
      },
    ],
    retainedOpenQuestions:
      fault === "question_dropped"
        ? []
        : [
            {
              questionId: QUESTION_ID,
              text: {
                en: "Which evidence would change the risk conclusion?",
                ko: "어떤 증거가 위험 결론을 바꿀 수 있습니까?",
              },
            },
          ],
    localizedClaimIds: {
      en: fault === "korean_only" ? [] : [CLAIM_ID],
      ko: [CLAIM_ID],
    },
    capabilities: [{ key: "market_price", availability: "unavailable" }],
    scenarios: [
      {
        field:
          fault === "target_price"
            ? "target_price"
            : fault === "unknown_scenario_field"
              ? "sentiment"
              : "revenue",
        value: "100",
      },
    ],
  };
}
