import type Database from "better-sqlite3";
import { z } from "zod";
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
  type ChairSynthesisPrompt,
  ChairSynthesisPromptSchema,
} from "./chairSynthesisContracts";
import { loadChairRelations } from "./chairSynthesisRelations";

function uniqueClaimsById<T extends { readonly claimId: string }>(
  items: readonly T[],
): readonly T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.claimId)) return false;
    seen.add(item.claimId);
    return true;
  });
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
  const auditedClaimIds = semantic.data.verdicts
    .filter((verdict) => verdict.verdict !== "contradicted")
    .map((verdict) => verdict.claimId)
    .sort();
  if (auditedClaimIds.length === 0) return undefined;
  const auditedClaimIdSet = new Set<string>(auditedClaimIds);
  const audited = uniqueClaimsById(
    structural.data.result.claims.filter((claim) =>
      auditedClaimIdSet.has(claim.claimId),
    ),
  );
  if (audited.length !== auditedClaimIds.length) return undefined;
  const claimSourceIds = new Map(
    uniqueClaimsById(structural.data.result.fixedEvidenceSlices).map(
      (slice) => [
        slice.claimId,
        [...new Set(slice.evidence.map((evidence) => evidence.artifactId))],
      ],
    ),
  );
  if (
    audited.some(
      (claim) => (claimSourceIds.get(claim.claimId)?.length ?? 0) === 0,
    )
  )
    return undefined;
  const mandate = loadChairMandate(database, runId);
  if (mandate === undefined) return undefined;
  const relations = await loadChairRelations({
    cas,
    rows: allRows,
    auditedClaimIds: auditedClaimIdSet,
    dissentClaimIds: structural.data.result.retainedDissentClaimIds,
  });
  if (relations === undefined) return undefined;
  const { positions, ballots, dissent: dissentSources } = relations;
  const unknowns = structural.data.result.retainedOpenQuestions;
  const scenarioLabels = {
    revenue: { en: "Revenue", ko: "매출" },
    operating_margin: { en: "Operating margin", ko: "영업이익률" },
    diluted_eps: { en: "Diluted EPS", ko: "희석 EPS" },
  } as const;
  const scenarios = structural.data.result.scenarios.flatMap(
    (scenario, index) => {
      const field = z
        .enum(["revenue", "operating_margin", "diluted_eps"])
        .safeParse(scenario.field);
      if (!field.success) return [];
      const labels = scenarioLabels[field.data];
      return [
        {
          id: `scenario:${index + 1}:${scenario.field}`,
          text: {
            en: `${labels.en}: ${scenario.value}`,
            ko: `${labels.ko}: ${scenario.value}`,
          },
        },
      ];
    },
  );
  if (scenarios.length !== structural.data.result.scenarios.length)
    return undefined;
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
    ...structural.data.result.retainedDissentClaimIds.flatMap(
      (claimId, index) => {
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
        const claim = audited.find(
          (candidate) => candidate.claimId === claimId,
        );
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
      },
    ),
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
              text: {
                en: claim.changeCondition.en,
                ko: claim.changeCondition.ko,
              },
            },
          ];
    }),
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
    dissentClaimIds: structural.data.result.retainedDissentClaimIds,
    unknownIds: unknowns.map((unknown) => unknown.questionId),
    scenarioIds: scenarios.map((scenario) => scenario.id),
    changeConditionClaimIds: audited
      .filter((claim) => claim.changeCondition !== undefined)
      .map((claim) => claim.claimId),
    sourceArtifactIds: [
      ...new Set([
        structuralRow.artifact_id,
        semanticRow.artifact_id,
        ...positions.map((item) => item.artifactId),
        ...ballots.map((item) => item.artifactId),
        ...dissentSources.flatMap((source) =>
          source === undefined ? [] : [source.artifactId],
        ),
        ...[...claimSourceIds.values()].flat(),
      ]),
    ],
    sentences,
  });
}
