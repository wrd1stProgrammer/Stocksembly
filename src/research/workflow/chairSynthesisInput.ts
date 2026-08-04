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
import { selectChairClaims } from "./chairSynthesisClaimSelection";
import {
  type ChairSynthesisPrompt,
  ChairSynthesisPromptSchema,
} from "./chairSynthesisContracts";
import { loadChairRelations } from "./chairSynthesisRelations";
import { chairScenarioSentences } from "./chairSynthesisScenarios";

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
  const scenarios = chairScenarioSentences(structural.data.result.scenarios);
  if (scenarios === undefined) return undefined;
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
    ...positions.map((position) => ({
      sentenceId: `position:${position.departmentId}`,
      kind: "position" as const,
      claimIds: position.claimIds,
      sourceArtifactIds: [position.artifactId],
      text: position.summary,
    })),
    ...ballots.map((ballot) => ({
      sentenceId: `ballot:${ballot.departmentId}`,
      kind: "ballot" as const,
      claimIds: ballot.claimIds,
      sourceArtifactIds: [ballot.artifactId],
      text: ballot.rationale,
    })),
    ...retainedDissentClaimIds.flatMap((claimId, index) => {
      const source = dissentSources[index];
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
  return ChairSynthesisPromptSchema.parse({
    kind: "chair_synthesis_input_v1",
    mandate,
    capabilities: structural.data.result.capabilities,
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
    changeConditionClaimIds: audited
      .filter((claim) => claim.changeCondition !== undefined)
      .map((claim) => claim.claimId)
      .concat(
        authenticatedRevisions.map((revision) => revision.adjudicatedClaimId),
      ),
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
      ]),
    ],
    sentences,
  });
}
