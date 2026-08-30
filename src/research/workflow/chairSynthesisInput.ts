import type Database from "better-sqlite3";
import { StructuralAuditArtifactEnvelopeSchema } from "../application/structuralAuditPersistenceContracts";
import { SemanticAuditOutputSchema } from "../domain/agentOutputs";
import { hashCanonical } from "../domain/contractHelpers";
import type { ArtifactCasPort } from "../ports/artifacts";
import {
  chairAgentPayload,
  chairArtifactJson,
  chairArtifactRows,
  loadChairMandate,
} from "./chairSynthesisArtifacts";
import {
  isComparatorAbsenceThesis,
  selectChairClaims,
} from "./chairSynthesisClaimSelection";
import {
  type ChairSynthesisPrompt,
  ChairSynthesisPromptSchema,
} from "./chairSynthesisContracts";
import { loadChairRelations } from "./chairSynthesisRelations";
import { recoverChairScenarioSentences } from "./chairSynthesisScenarios";
import { sealComparatorContextForChair } from "./preSynthesisComparatorQualification";

const GENERIC_CHANGE_CONDITION_EN =
  "A later official filing or revised macro observation changes the supporting evidence.";
const GENERIC_CHANGE_CONDITION_KO =
  "후속 공식 공시 또는 수정된 거시 관측치가 근거를 변경할 때 판단도 바뀝니다.";
function claimSpecificChangeCondition(
  condition: { readonly en: string; readonly ko: string },
  _claimText: { readonly en: string; readonly ko: string },
): { readonly en: string; readonly ko: string } {
  if (
    condition.en.trim() === GENERIC_CHANGE_CONDITION_EN &&
    condition.ko.trim() === GENERIC_CHANGE_CONDITION_KO
  )
    return condition;
  return { en: condition.en, ko: condition.ko };
}

type ChairSentence = {
  readonly sentenceId: string;
  readonly kind: ChairSynthesisPrompt["sentences"][number]["kind"];
  readonly claimIds: readonly string[];
  readonly sourceArtifactIds: readonly string[];
  readonly text: { readonly en: string; readonly ko: string };
};

function deduplicateChairSentenceCatalog(
  sentences: readonly ChairSentence[],
): readonly ChairSentence[] {
  const bySentenceId = new Map<string, ChairSentence>();
  for (const sentence of sentences) {
    const existing = bySentenceId.get(sentence.sentenceId);
    if (existing === undefined) {
      bySentenceId.set(sentence.sentenceId, sentence);
      continue;
    }
    bySentenceId.set(sentence.sentenceId, {
      ...existing,
      claimIds: [...new Set([...existing.claimIds, ...sentence.claimIds])],
      sourceArtifactIds: [
        ...new Set([
          ...existing.sourceArtifactIds,
          ...sentence.sourceArtifactIds,
        ]),
      ],
    });
  }
  return [...bySentenceId.values()];
}

function requestsRelativeComparison(question: string): boolean {
  return /(?:동종|업계|섹터|벤치마크|상대|경쟁사.{0,12}비교|살\s*바에|사는\s*게|보다.{0,12}(?:낫|좋|유리)|대신.{0,12}(?:사|투자)|peer|comparator|benchmark|relative|versus|\bvs\.?\b)/iu.test(
    question,
  );
}

function withoutComparatorAbsence(text: {
  readonly en: string;
  readonly ko: string;
}): { readonly en: string; readonly ko: string } {
  if (!isComparatorAbsenceThesis(text)) return text;
  return {
    en: "The recent price move alone does not establish a durable medium-term trend. A new entry should wait until the rebound holds as a repeatable trend rather than a single-session reaction.",
    ko: "최근 주가 움직임만으로 중기 추세 전환을 확정하기 어렵습니다. 신규 진입은 단일 거래일의 반응이 아니라 반등이 지속 가능한 추세로 이어지는지 확인한 뒤 판단해야 합니다.",
  };
}

export async function loadChairPrompt(
  database: Database.Database,
  cas: ArtifactCasPort,
  runId: string,
): Promise<ChairSynthesisPrompt | undefined> {
  const allRows = chairArtifactRows(database, runId);
  const structuralRow = allRows.find(
    (row) => row.logical_key === "structural_audit:system",
  );
  const semanticRow = allRows.find(
    (row) => row.logical_key === "semantic_audit:system",
  );
  if (structuralRow === undefined || semanticRow === undefined)
    return undefined;
  const structural = StructuralAuditArtifactEnvelopeSchema.safeParse(
    await chairArtifactJson(cas, structuralRow),
  );
  const semanticPayload = await chairAgentPayload(
    cas,
    semanticRow,
    "semantic_audit:system",
  );
  if (!structural.success || !structural.data.publishable) return undefined;
  const result = structural.data.result;
  const { auditHash: _auditHash, ...auditCore } = result;
  if (
    structural.data.runId !== structuralRow.run_id ||
    structural.data.snapshotId !== structuralRow.snapshot_id ||
    structural.data.auditHash !== result.auditHash ||
    structural.data.claimSetHash !== result.claimSetHash ||
    result.auditHash !== hashCanonical(auditCore) ||
    result.claimSetHash !==
      hashCanonical(result.claims.map((claim) => claim.claimHash).sort())
  )
    return undefined;
  const semantic = SemanticAuditOutputSchema.safeParse(semanticPayload);
  if (!semantic.success) return undefined;
  const semanticallyAcceptedClaimIds = semantic.data.verdicts
    .filter((verdict) => verdict.verdict !== "contradicted")
    .map((verdict) => verdict.claimId)
    .sort();
  if (semanticallyAcceptedClaimIds.length === 0) return undefined;
  const semanticallyAcceptedClaimIdSet = new Set<string>(
    semanticallyAcceptedClaimIds,
  );
  const claimSourceIds = new Map(
    [
      ...new Map(
        structural.data.result.fixedEvidenceSlices.map((slice) => [
          slice.claimId,
          slice,
        ]),
      ).values(),
    ].map((slice) => [
      slice.claimId,
      [...new Set(slice.evidence.map((evidence) => evidence.artifactId))],
    ]),
  );
  const mandate = loadChairMandate(database, runId);
  if (mandate === undefined) return undefined;
  const relations = await loadChairRelations({
    database,
    cas,
    rows: allRows,
    auditedClaimIds: semanticallyAcceptedClaimIdSet,
    dissentClaimIds: structural.data.result.retainedDissentClaimIds,
  });
  if (relations === undefined) return undefined;
  const {
    positions,
    ballots,
    dissent: dissentSources,
    challengeDissent,
    responseDissent,
    revisions,
  } = relations;
  const excludeComparatorAbsenceClaims = !requestsRelativeComparison(
    mandate.question ?? "",
  );
  const {
    audited,
    authenticatedRevisions,
    auditedClaimIds,
    retainedDissentClaimIds,
  } = selectChairClaims({
    structuralClaims: structural.data.result.claims,
    semanticallyAcceptedClaimIds: semanticallyAcceptedClaimIdSet,
    positionClaimIds: positions.flatMap((position) => position.claimIds),
    revisions,
    retainedDissentClaimIds: structural.data.result.retainedDissentClaimIds,
    excludeComparatorAbsenceClaims,
  });
  if (
    audited.length + authenticatedRevisions.length === 0 ||
    audited.some(
      (claim) => (claimSourceIds.get(claim.claimId)?.length ?? 0) === 0,
    )
  )
    return undefined;
  const authenticatedCountercases = [
    ...challengeDissent,
    ...responseDissent,
  ].filter((source) =>
    source.claimIds.every((claimId) => auditedClaimIds.includes(claimId)),
  );
  const unknowns = structural.data.result.retainedOpenQuestions;
  const scenarioRecovery = recoverChairScenarioSentences(
    structural.data.result.scenarios,
  );
  const scenarios = scenarioRecovery.sentences;
  const comparatorQualification =
    structural.data.result.metricSnapshot?.comparatorQualification;
  const comparatorContext = sealComparatorContextForChair(
    comparatorQualification === undefined
      ? { status: "not_available", reason: "peer_evidence_absent" }
      : { status: "available", qualification: comparatorQualification },
  );
  const investmentModel =
    structural.data.result.metricSnapshot?.investmentModel;
  const investmentModelSourceIds = [
    ...new Set(
      allRows
        .filter((row) =>
          /(?:insightsentry_(?:quote|fundamentals|peers)|structural_audit)/u.test(
            row.logical_key,
          ),
        )
        .map((row) => row.artifact_id),
    ),
  ];
  const modelSourceIds =
    investmentModelSourceIds.length > 0
      ? investmentModelSourceIds
      : [structuralRow.artifact_id];
  const investmentModelSentences =
    investmentModel === undefined
      ? []
      : [
          {
            sentenceId: "model:valuation:summary",
            kind: "scenario" as const,
            claimIds: [],
            sourceArtifactIds: modelSourceIds,
            text: {
              en: `${investmentModel.methodLabel.en}. ${investmentModel.summary.en}`,
              ko: `${investmentModel.methodLabel.ko}. ${investmentModel.summary.ko}`,
            },
          },
          ...investmentModel.scenarios.map((scenario) => ({
            sentenceId: `model:valuation:${scenario.id}`,
            kind: "scenario" as const,
            claimIds: [],
            sourceArtifactIds: modelSourceIds,
            text: {
              en: `${scenario.label.en}: ${scenario.assumptions.map((item) => item.en).join("; ")}${scenario.impliedPrice === undefined ? "" : `, implying $${scenario.impliedPrice.toFixed(2)} (${scenario.returnPercent === undefined ? "return not calculated" : `${scenario.returnPercent}% versus the observed price`})`}.`,
              ko: `${scenario.label.ko}: ${scenario.assumptions.map((item) => item.ko).join("; ")}${scenario.impliedPrice === undefined ? "" : `, 산출 가격 $${scenario.impliedPrice.toFixed(2)} (현재가 대비 ${scenario.returnPercent === undefined ? "수익률 미산출" : `${scenario.returnPercent}%`})`}.`,
            },
          })),
        ];
  const sentences = [
    ...audited.flatMap((claim) => {
      const sourceArtifactIds = claimSourceIds.get(claim.claimId);
      return sourceArtifactIds === undefined
        ? []
        : [
            {
              sentenceId: `claim:${claim.claimId}`,
              kind: "claim" as const,
              claimIds: [claim.claimId],
              sourceArtifactIds,
              text: claim.text,
            },
          ];
    }),
    ...authenticatedRevisions.map((revision) => ({
      sentenceId: `claim:${revision.adjudicatedClaimId}`,
      kind: "claim" as const,
      claimIds: [revision.adjudicatedClaimId],
      sourceArtifactIds: revision.sourceArtifactIds,
      text: revision.publicSummary,
    })),
    ...positions.map((position) => {
      const claimIds = position.claimIds.filter((claimId) =>
        auditedClaimIds.includes(claimId),
      );
      return {
        sentenceId: `position:${position.departmentId}`,
        kind: "position" as const,
        claimIds,
        sourceArtifactIds: [position.artifactId],
        text:
          excludeComparatorAbsenceClaims === true
            ? withoutComparatorAbsence(position.summary)
            : position.summary,
      };
    }),
    ...ballots.map((ballot) => {
      const claimIds = ballot.claimIds.filter((claimId) =>
        auditedClaimIds.includes(claimId),
      );
      return {
        sentenceId: `ballot:${ballot.departmentId}`,
        kind: "ballot" as const,
        claimIds,
        sourceArtifactIds: [ballot.artifactId],
        text:
          excludeComparatorAbsenceClaims === true
            ? withoutComparatorAbsence(ballot.rationale)
            : ballot.rationale,
      };
    }),
    ...retainedDissentClaimIds.flatMap((claimId) => {
      const source = dissentSources.find(
        (candidate) => candidate?.claimId === claimId,
      );
      if (source !== undefined)
        return [
          {
            sentenceId: `dissent:${source.claimId}`,
            kind: "dissent" as const,
            claimIds: [source.claimId],
            sourceArtifactIds: [source.artifactId],
            text: source.text,
          },
        ];
      const claim = audited.find((candidate) => candidate.claimId === claimId);
      const sourceArtifactIds = claimSourceIds.get(claimId);
      return claim === undefined || sourceArtifactIds === undefined
        ? []
        : [
            {
              sentenceId: `dissent:${claimId}`,
              kind: "dissent" as const,
              claimIds: [claimId],
              sourceArtifactIds,
              text: claim.text,
            },
          ];
    }),
    ...authenticatedCountercases.map((source) => ({
      sentenceId: source.sentenceId,
      kind: "dissent" as const,
      claimIds: source.claimIds,
      sourceArtifactIds: source.sourceArtifactIds,
      text: source.text,
    })),
    ...unknowns.map((unknown) => ({
      sentenceId: `unknown:${unknown.questionId}`,
      kind: "unknown" as const,
      claimIds: [],
      sourceArtifactIds: [structuralRow.artifact_id],
      text: unknown.text,
    })),
    ...scenarios.map((scenario) => ({
      sentenceId: scenario.id,
      kind: "scenario" as const,
      claimIds: [],
      sourceArtifactIds: [structuralRow.artifact_id],
      text: scenario.text,
    })),
    ...investmentModelSentences,
    ...audited.flatMap((claim) => {
      const sourceArtifactIds = claimSourceIds.get(claim.claimId);
      return claim.changeCondition === undefined ||
        sourceArtifactIds === undefined
        ? []
        : [
            {
              sentenceId: `change_condition:${claim.claimId}`,
              kind: "change_condition" as const,
              claimIds: [claim.claimId],
              sourceArtifactIds,
              text: claimSpecificChangeCondition(
                claim.changeCondition,
                claim.text,
              ),
            },
          ];
    }),
    ...authenticatedRevisions.map((revision) => ({
      sentenceId: `change_condition:${revision.adjudicatedClaimId}`,
      kind: "change_condition" as const,
      claimIds: [revision.adjudicatedClaimId],
      sourceArtifactIds: revision.sourceArtifactIds,
      text: claimSpecificChangeCondition(
        revision.falsifier,
        revision.publicSummary,
      ),
    })),
  ];
  const uniqueSentences = deduplicateChairSentenceCatalog(sentences);
  return ChairSynthesisPromptSchema.parse({
    kind: "chair_synthesis_input_v1",
    mandate,
    capabilities: structural.data.result.capabilities,
    comparatorContext,
    recoveryMetadata: {
      comparatorNormalizationAttemptCount:
        comparatorContext.normalizationAttemptCount,
      scenarioRepairAttempts: scenarioRecovery.repairAttempts,
      omissions: [
        ...(comparatorContext.mode === "qualitative_only"
          ? [
              {
                itemId: "comparator_valuation",
                reason: comparatorContext.omissionReason,
              },
            ]
          : []),
        ...scenarioRecovery.omissions,
      ],
    },
    ...(investmentModel === undefined ? {} : { investmentModel }),
    auditedClaimIds,
    departmentPositions: positions.map(
      ({ summary: _summary, claimIds: _claimIds, ...position }) => position,
    ),
    ballots: ballots.map(
      ({ rationale: _rationale, claimIds: _claimIds, ...ballot }) => ballot,
    ),
    dissentClaimIds: retainedDissentClaimIds,
    unknownIds: unknowns.map((unknown) => unknown.questionId),
    scenarioIds: scenarios.map((scenario) => scenario.id),
    changeConditionClaimIds: [
      ...new Set(
        audited
          .filter((claim) => claim.changeCondition !== undefined)
          .map((claim) => claim.claimId)
          .concat(
            authenticatedRevisions.map(
              (revision) => revision.adjudicatedClaimId,
            ),
          ),
      ),
    ],
    sourceArtifactIds: [
      ...new Set([
        structuralRow.artifact_id,
        semanticRow.artifact_id,
        ...positions.map((item) => item.artifactId),
        ...ballots.map((item) => item.artifactId),
        ...dissentSources.flatMap((source) =>
          source === undefined ? [] : [source.artifactId],
        ),
        ...authenticatedCountercases.flatMap(
          (source) => source.sourceArtifactIds,
        ),
        ...[...claimSourceIds.values()].flat(),
        ...authenticatedRevisions.flatMap(
          (revision) => revision.sourceArtifactIds,
        ),
        ...modelSourceIds,
      ]),
    ],
    sentences: uniqueSentences,
  });
}
