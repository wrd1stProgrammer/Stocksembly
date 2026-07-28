import { createAtomicClaim } from "../domain/claims";
import { hashBytes, hashCanonical } from "../domain/contractHelpers";
import type { SourceLocator } from "../domain/evidenceCoreSchemas";
import type { SpecialistRoundInput } from "../workflow/specialistRound";
import { specialistRequest } from "../workflow/specialistRoundInput";
import type { SpecialistSourceArtifact } from "../workflow/specialistRoundSqlite";
import type { WorkflowRetentionRegister } from "../workflow/structuralAuditWorkflowRegister";

type Harness = {
  readonly input: SpecialistRoundInput;
  readonly sources: readonly SpecialistSourceArtifact[];
};

const CLAIM_ID = "00000000-0000-4000-8000-000000000904";

export function expectedWorkflowRetention(
  harness: Harness,
): WorkflowRetentionRegister {
  const requests = harness.input.assignments.assignments.map(
    (assignment, index) =>
      specialistRequest(harness.input, assignment, {
        ordinal: index + 1,
        purpose: "mandatory_first",
      }),
  );
  const marketNews = requests.find(
    (request) => request.role.id === "market_news",
  );
  if (marketNews === undefined)
    throw new TypeError("market-news request fixture is missing");
  return {
    dissentClaimIds: [marketNews.ids.claimId],
    openQuestions: [],
  };
}

function sourceTimes(locator: SourceLocator) {
  if (locator.kind === "sec_filing")
    return {
      retrievedAt: locator.acceptedAt,
      availableAt: locator.acceptedAt,
      accession: locator.accession,
      activeAccession: locator.accession,
    };
  return {
    retrievedAt: "2026-01-20T00:01:00.000Z",
    availableAt: "2026-01-20T00:01:00.000Z",
  };
}

export function makePersistableStructuralInput(harness: Harness) {
  const source = harness.sources[0];
  if (source === undefined) throw new TypeError("source fixture is missing");
  const runId = harness.input.mandate.runId;
  const snapshotId = harness.input.snapshot.snapshotId;
  const content = new TextDecoder().decode(source.bytes);
  const locatorHash = hashCanonical(source.locator);
  const evidenceId = source.evidenceId;
  const retention = expectedWorkflowRetention(harness);
  const claim = createAtomicClaim({
    claimId: CLAIM_ID,
    runId,
    snapshotId,
    text: {
      en: "The accepted filing supports the material finding.",
      ko: "접수된 공시는 중요한 결론을 뒷받침합니다.",
    },
    epistemicClass: "interpretation",
    stance: "mixed",
    materiality: "material",
    claimType: "operating_performance",
    supportingEvidence: [{ evidenceId, locatorHash }],
    opposingEvidence: [
      { evidenceId, locatorHash, reason: "Fixed adversarial evidence slice" },
    ],
    asOf: "2026-01-20T00:01:00.000Z",
    freshness: "fresh",
    uncertainty: "medium",
    changeCondition: {
      en: "A later accepted amendment changes the source fact.",
      ko: "추후 접수된 정정 공시가 원천 사실을 변경합니다.",
      triggerEvidenceIds: [evidenceId],
    },
  });
  return {
    runId,
    snapshotId,
    evidenceCutoffAt: harness.input.snapshot.evidenceCutoffAt,
    claims: [
      {
        claim,
        atomicFactCount: 1,
        requiresOpposingEvidence: true,
        numericAssertions: [],
        capabilityFields: [],
      },
    ],
    evidence: [
      {
        evidenceId,
        artifactId: source.artifactId,
        runId,
        snapshotId,
        source: source.locator.source,
        surface: "model_transfer",
        locatorHash,
        content,
        contentHash: hashBytes(content),
        span: {
          start: 0,
          end: content.length,
          textHash: hashBytes(content),
        },
        ...sourceTimes(source.locator),
      },
    ],
    values: { runId, snapshotId, records: [] },
    acceptedMemos: [],
    sourceDissentClaimIds: retention.dissentClaimIds,
    retainedDissentClaimIds: retention.dissentClaimIds,
    sourceOpenQuestionIds: retention.openQuestions.map(
      (question) => question.questionId,
    ),
    retainedOpenQuestionIds: retention.openQuestions.map(
      (question) => question.questionId,
    ),
    sourceOpenQuestions: retention.openQuestions,
    retainedOpenQuestions: retention.openQuestions,
    localizedClaimIds: { en: [CLAIM_ID], ko: [CLAIM_ID] },
    capabilities: [],
    scenarios: [{ field: "revenue", value: "100" }],
  };
}
