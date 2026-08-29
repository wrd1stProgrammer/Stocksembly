import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { ArtifactIdSchema } from "../domain/ids";
import { evaluatePublicationQuality } from "../domain/qualityPolicy";
import { ResearchReportSchema } from "../domain/report";
import { SourceRegisterEntrySchema } from "../domain/reportComponents";
import { SemanticAuditSchema } from "../domain/reportSemantic";
import { normalizeReportNarrativeText } from "../domain/reportText";
import { composeWorkflowV2Report } from "../workflow/workflowV2PublicationComposer";
import type {
  AssembleReportResult,
  AssemblyInput,
} from "./assembleReportContracts";
import {
  chairValidationReason,
  localizedReport,
  SECTION_TITLES,
  scenarioMetric,
} from "./assembleReportValidation";
import { recoverPublicPublication } from "./publicationRecovery";
import { StructuralAuditArtifactEnvelopeSchema } from "./structuralAuditPersistenceContracts";

export type {
  AssembleReportResult,
  AssemblyInput,
} from "./assembleReportContracts";

import { REQUIRED_REPORT_ARTIFACT_ROLES } from "../domain/reportArtifactProvenance";

function scaleDecimal(value: string, zeroCount: number): string {
  const [whole = "0", fraction = ""] = value.replaceAll(",", "").split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  return fraction.length <= zeroCount
    ? `${digits}${"0".repeat(zeroCount - fraction.length)}`
    : digits.slice(0, digits.length - (fraction.length - zeroCount));
}

function inferredScenarioValue(
  field: string,
  sentences: AssemblyInput["chairSentences"],
): string | undefined {
  if (field !== "revenue") return undefined;
  for (const sentence of sentences) {
    if (!/\brevenue\b/i.test(sentence.text.en)) continue;
    const match = sentence.text.en.match(
      /\$?\s*([\d,.]+)\s*(trillion|billion|million|tn|bn|mm|t|b|m)\b/i,
    );
    if (match?.[1] === undefined || match[2] === undefined) continue;
    const magnitude = match[2].toLowerCase();
    const zeros = ["trillion", "tn", "t"].includes(magnitude)
      ? 12
      : ["billion", "bn", "b"].includes(magnitude)
        ? 9
        : 6;
    return scaleDecimal(match[1], zeros);
  }
  return undefined;
}

export function assembleReport(input: AssemblyInput): AssembleReportResult {
  const selectedText = (value: {
    readonly en: string;
    readonly ko: string;
  }) => ({ en: value.en, ko: value.ko });
  const structural = StructuralAuditArtifactEnvelopeSchema.safeParse(
    input.structuralAudit,
  );
  const semantic = SemanticAuditSchema.safeParse(input.semanticAudit);
  const chair = ChairSynthesisOutputSchema.safeParse(input.chair);
  if (!structural.success || !semantic.success || !chair.success)
    return { kind: "blocked", reason: "invalid_input" };
  const chairRecovery = chair.data.recoveryMetadata;
  const audit = structural.data.result;
  if (
    input.version !== (input.priorReport?.version ?? 0) + 1 ||
    (input.priorReport !== undefined &&
      (input.priorReport.reportId !== input.reportId ||
        input.priorReport.runId !== audit.runId ||
        input.priorReport.snapshotId !== audit.snapshotId))
  )
    return { kind: "blocked", reason: "version_lineage_mismatch" };
  if (
    !audit.publishable ||
    audit.blockers.length > 0 ||
    audit.metrics.some((metric) => metric.passed !== metric.denominator)
  )
    return { kind: "blocked", reason: "audit_failed" };
  if (
    semantic.data.runId !== audit.runId ||
    semantic.data.snapshotId !== audit.snapshotId ||
    semantic.data.reportVersionId !== input.versionId
  )
    return { kind: "blocked", reason: "audit_lineage_mismatch" };
  const auditedClaimIds = new Set<string>(
    audit.claims.map((claim) => claim.claimId),
  );
  const verdicts = new Map<string, (typeof semantic.data.verdicts)[number]>(
    semantic.data.verdicts.map((verdict) => [verdict.claimId, verdict]),
  );
  const retainedDissentClaimIds = audit.retainedDissentClaimIds.filter(
    (claimId) => {
      const verdict = verdicts.get(claimId)?.verdict;
      return verdict !== undefined && verdict !== "contradicted";
    },
  );
  const chairClaimIds = new Set<string>([
    ...auditedClaimIds,
    ...retainedDissentClaimIds,
  ]);
  const chairReason = chairValidationReason({
    chair: chair.data,
    locale: input.locale,
    sentences: input.chairSentences,
    auditedClaimIds: chairClaimIds,
    retainedDissentClaimIds,
    retainedOpenQuestionCount: audit.retainedOpenQuestions.length,
  });
  if (chairReason !== undefined)
    return { kind: "blocked", reason: chairReason };
  if (
    audit.claims.some(
      (claim) => verdicts.get(claim.claimId)?.materiality !== claim.materiality,
    )
  )
    return { kind: "blocked", reason: "semantic_claim_mismatch" };
  const evidenceByClaim = new Map<string, readonly string[]>(
    audit.fixedEvidenceSlices.map((entry) => [
      entry.claimId,
      [...new Set(entry.evidence.map((slice) => slice.artifactId))],
    ]),
  );
  const parsedSources = SourceRegisterEntrySchema.array().safeParse(
    input.authenticatedSources,
  );
  if (!parsedSources.success)
    return { kind: "blocked", reason: "report_source_invalid" };
  const sources = parsedSources.data;
  const claims: {
    claimId: string;
    text?: { en: string; ko: string };
    materiality: "material" | "supporting";
    semanticVerdict: "entailed" | "partial" | "contradicted" | "not_assessable";
    sourceIds: readonly string[];
  }[] = audit.claims
    .filter((claim) => verdicts.get(claim.claimId)?.verdict !== "contradicted")
    .map((claim) => ({
      claimId: claim.claimId,
      text: selectedText({
        en: normalizeReportNarrativeText(
          claim.text.en,
          "The authenticated evidence supports this claim with limitations.",
        ),
        ko: normalizeReportNarrativeText(
          claim.text.ko,
          "인증된 근거는 한계와 함께 이 주장을 뒷받침합니다.",
        ),
      }),
      materiality: claim.materiality,
      semanticVerdict: verdicts.get(claim.claimId)?.verdict ?? "not_assessable",
      sourceIds: evidenceByClaim.get(claim.claimId) ?? [],
    }));
  const registeredClaimIds = new Set(claims.map((claim) => claim.claimId));
  for (const claimId of retainedDissentClaimIds)
    if (!registeredClaimIds.has(claimId)) {
      const auditedClaim = audit.claims.find(
        (claim) => claim.claimId === claimId,
      );
      claims.push({
        claimId,
        ...(auditedClaim === undefined
          ? {}
          : {
              text: selectedText({
                en: normalizeReportNarrativeText(
                  auditedClaim.text.en,
                  "The authenticated evidence supports this claim with limitations.",
                ),
                ko: normalizeReportNarrativeText(
                  auditedClaim.text.ko,
                  "인증된 근거는 한계와 함께 이 주장을 뒷받침합니다.",
                ),
              }),
            }),
        materiality: "supporting",
        semanticVerdict: "not_assessable",
        sourceIds: [
          ...new Set(
            input.chairSentences
              .filter(
                (sentence) =>
                  sentence.kind === "dissent" &&
                  sentence.claimIds.includes(claimId),
              )
              .flatMap((sentence) => sentence.sourceArtifactIds),
          ),
        ],
      });
      registeredClaimIds.add(claimId);
    }
  const claimRegisterById = new Map(
    claims.map((claim) => [claim.claimId, claim] as const),
  );
  const publicationClaims =
    input.publicationClaims ??
    claims.map((claim) => ({
      claim: {
        claimId: claim.claimId,
        kind: "factual_claim" as const,
        materiality: claim.materiality,
        semanticVerdict: claim.semanticVerdict,
      },
      ...(claim.text === undefined ? {} : { text: claim.text }),
      sourceIds: claim.sourceIds,
    }));
  const scenarios = audit.scenarios.flatMap((scenario, index) => {
    const metric = scenarioMetric(scenario.field);
    const scenarioId = input.chairScenarioIds[index];
    const scenarioSentence = input.chairSentences.find(
      (sentence) => sentence.sentenceId === scenarioId,
    );
    const value = /^-?\d+(?:\.\d+)?$/.test(scenario.value)
      ? scenario.value
      : inferredScenarioValue(scenario.field, input.chairSentences);
    if (metric === undefined || value === undefined) return [];
    if (scenarioId === undefined || scenarioSentence === undefined) return [];
    return [
      {
        id: scenarioId,
        name: selectedText(scenarioSentence.text),
        assumptions: [{ ...metric, value }],
        claimIds: scenarioSentence.claimIds,
        sourceIds: scenarioSentence.sourceArtifactIds,
      },
    ];
  });
  const publication = recoverPublicPublication({
    registeredSourceIds: sources.map((source) => source.sourceId),
    claims: publicationClaims,
    scenarios,
    ...(input.repairPublicClaim === undefined
      ? {}
      : { repairClaim: input.repairPublicClaim }),
    ...(input.repairPublicScenario === undefined
      ? {}
      : { repairScenario: input.repairPublicScenario }),
  });
  if (publication.blockers.length > 0)
    return { kind: "blocked", reason: "no_grounded_core_answer" };
  const recoveredClaimIds = new Set(
    publication.publishedClaims.map((entry) => entry.claim.claimId),
  );
  const recoveredClaims = publication.publishedClaims.flatMap((entry) => {
    const registered = claimRegisterById.get(entry.claim.claimId);
    return registered === undefined ? [] : [registered];
  });
  const recoveredScenarioIds = new Set(
    publication.publishedScenarios.map((scenario) => scenario.id),
  );
  const recoveredScenarios = scenarios.filter((scenario) =>
    recoveredScenarioIds.has(scenario.id),
  );
  const registeredSourceIds = new Set<string>(
    sources.map((source) => source.sourceId),
  );
  const sections = chair.data.sections.map((section) => ({
    id: section.sectionKey,
    title: SECTION_TITLES[section.sectionKey],
    body: section.publicSummary,
    claimIds: section.auditedClaimIds.filter((claimId) =>
      recoveredClaimIds.has(claimId),
    ),
    sourceIds: section.sourceArtifactIds.filter((sourceId) =>
      registeredSourceIds.has(sourceId),
    ),
  }));
  const dissent = retainedDissentClaimIds.map((claimId) => {
    const sentences = input.chairSentences.filter(
      (sentence) =>
        sentence.kind === "dissent" && sentence.claimIds.includes(claimId),
    );
    const auditedFallback = claims.find((claim) => claim.claimId === claimId);
    const sentenceSources = [
      ...new Set(sentences.flatMap((sentence) => sentence.sourceArtifactIds)),
    ];
    const english = sentences.map((sentence) => sentence.text.en).join(" ");
    const korean = sentences.map((sentence) => sentence.text.ko).join(" ");
    return {
      claimId,
      sourceIds:
        sentenceSources.length > 0
          ? sentenceSources
          : (auditedFallback?.sourceIds ?? []),
      text: selectedText({
        en: english || auditedFallback?.text?.en || "",
        ko: korean || auditedFallback?.text?.ko || "",
      }),
    };
  });
  if (dissent.some((entry) => entry.text.en === "" || entry.text.ko === ""))
    return { kind: "blocked", reason: "retention_mismatch" };
  const locales = localizedReport({
    sections,
    scenarios: recoveredScenarios,
    dissent,
    questions: audit.retainedOpenQuestions,
    evidenceByClaim,
  });
  const capabilities = audit.capabilities.map((capability) => ({
    ...capability,
    ...(capability.availability === "available"
      ? {}
      : { limitationId: `limitation:${capability.key}` }),
  }));
  const limitations = [
    ...capabilities
      .filter((capability) => capability.availability !== "available")
      .map((capability) => ({
        id: `limitation:${capability.key}`,
        capability: capability.key,
      })),
    ...publication.limitations.map((entry) => ({
      id: `limitation:claim:${entry.claim.claimId}`,
      capability: "claim_evidence",
    })),
  ];
  const status =
    limitations.length > 0 ? "complete_with_limitations" : "complete";
  const quality = evaluatePublicationQuality({
    requestedStatus: status,
    acceptedArtifactCount: input.artifacts.length,
    requiredArtifactCount: REQUIRED_REPORT_ARTIFACT_ROLES.length,
    capabilities: capabilities.map((capability) => ({
      key: capability.key,
      availability: capability.availability,
    })),
    claims: recoveredClaims.map((claim) => ({
      claimId: claim.claimId,
      materiality: claim.materiality,
      semanticVerdict: claim.semanticVerdict,
      support: claim.sourceIds.length > 0 ? "supported" : "unsupported",
    })),
    metrics: [...audit.metrics, ...semantic.data.metrics],
  });
  if (!quality.publishable)
    return { kind: "blocked", reason: quality.blockers[0] ?? "quality_failed" };
  const priorClaimIds = new Set<string>(
    input.priorReport?.claims.map((claim) => claim.claimId) ?? [],
  );
  const dataCoverage = sources.map((source) => ({
    dataset: source.dataset ?? source.sourceClass,
    provider: source.publisher,
    status: source.providerStatus ?? ("available" as const),
    ...(source.observedPeriod === undefined
      ? {}
      : {
          observedFrom: source.observedPeriod.from,
          observedTo: source.observedPeriod.to,
          ...(source.observedPeriod.observationCount === undefined
            ? {}
            : {
                observationCount: source.observedPeriod.observationCount,
              }),
        }),
    ...(source.limitations?.[0] === undefined
      ? {}
      : { limitation: source.limitations[0] }),
  }));
  const providerSources = sources.filter(
    (source) => source.sourceClass === "insightsentry_rapidapi",
  );
  const providerMismatch = providerSources.some((source) =>
    source.limitations?.some((limitation) =>
      limitation.startsWith("insightsentry_sec_"),
    ),
  );
  const providerAvailable = providerSources.some(
    (source) => source.providerStatus === "available",
  );
  const providerDisagreements = [
    {
      id: "insightsentry-sec-authority",
      authoritativeSource: "sec_company_facts" as const,
      comparedSource: "insightsentry_rapidapi" as const,
      status: providerMismatch
        ? ("material_disagreement" as const)
        : providerAvailable
          ? ("none_observed" as const)
          : ("not_comparable" as const),
      note: providerMismatch
        ? {
            en: "A licensed-provider value differs from the comparable SEC registry value. The SEC value remains authoritative.",
            ko: "라이선스 공급자 값이 비교 가능한 SEC 등록 값과 다릅니다. SEC 값을 기준으로 유지합니다.",
          }
        : providerAvailable
          ? {
              en: "No material disagreement is recorded in the comparable cited values. SEC values remain authoritative.",
              ko: "비교 가능한 인용 값에서 중대한 불일치는 기록되지 않았습니다. SEC 값을 기준으로 유지합니다.",
            }
          : {
              en: "No comparable licensed-provider value was available. SEC values remain authoritative.",
              ko: "비교 가능한 라이선스 공급자 값이 없었습니다. SEC 값을 기준으로 유지합니다.",
            },
    },
  ];
  const report = ResearchReportSchema.safeParse({
    schemaVersion: "workflow-v1",
    reportId: input.reportId,
    versionId: input.versionId,
    version: input.version,
    runId: audit.runId,
    snapshotId: audit.snapshotId,
    status,
    ...(input.researchDirection === undefined
      ? {}
      : { researchDirection: input.researchDirection }),
    ...(audit.marketSnapshot === undefined
      ? {}
      : { marketSnapshot: audit.marketSnapshot }),
    ...(audit.metricSnapshot === undefined
      ? {}
      : { metricSnapshot: audit.metricSnapshot }),
    teamViews: input.teamViews.map((view) => ({
      ...view,
      position: selectedText(view.position),
      rationale: selectedText(view.rationale),
    })),
    artifacts: input.artifacts,
    capabilities,
    locales,
    versionDelta: {
      priorVersionId: input.priorReport?.versionId ?? null,
      addedClaimIds: recoveredClaims
        .filter((claim) => !priorClaimIds.has(claim.claimId))
        .map((claim) => claim.claimId),
      removedClaimIds: [...priorClaimIds].filter(
        (claimId) =>
          !recoveredClaims.some((claim) => claim.claimId === claimId),
      ),
    },
    claims: recoveredClaims,
    sources,
    dataCoverage,
    providerDisagreements,
    metrics: [...audit.metrics, ...semantic.data.metrics],
    limitations,
  });
  if (!report.success) {
    process.stderr.write(
      `${JSON.stringify({
        kind: "report_schema_invalid",
        runId: audit.runId,
        issues: report.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      })}\n`,
    );
    return { kind: "blocked", reason: "report_invalid" };
  }
  const publicEvidenceIds = new Set<string>(
    sources.map((source) => source.sourceId),
  );
  const editorialClaims = (input.editorialClaims ?? []).flatMap((claim) => {
    if (!recoveredClaimIds.has(claim.claimId)) return [];
    const evidenceArtifactIds = (evidenceByClaim.get(claim.claimId) ?? [])
      .filter((artifactId) => publicEvidenceIds.has(artifactId))
      .map((artifactId) => ArtifactIdSchema.parse(artifactId));
    return evidenceArtifactIds.length === 0
      ? []
      : [{ ...claim, evidenceArtifactIds }];
  });
  try {
    const composed = composeWorkflowV2Report({
      legacyReport: report.data,
      chair: chair.data,
      chairSentences: input.chairSentences,
      comparators: input.comparators ?? [],
      editorialClaims,
      ...(input.researchProfile === undefined
        ? {}
        : { researchProfile: input.researchProfile }),
    });
    return {
      kind: "assembled",
      report: composed.report,
      editorialPublication: composed.envelope,
      recoveryMetadata: {
        ...(chairRecovery === undefined
          ? {}
          : {
              comparatorNormalizationAttemptCount:
                chairRecovery.comparatorNormalizationAttemptCount,
            }),
        omissions: [
          ...new Map(
            [...(chairRecovery?.omissions ?? []), ...publication.omissions].map(
              (omission) => [JSON.stringify(omission), omission],
            ),
          ).values(),
        ],
        repairAttempts: publication.repairAttempts,
        scenarioRepairAttempts: [
          ...new Map(
            [
              ...(chairRecovery?.scenarioRepairAttempts ?? []),
              ...publication.scenarioRepairAttempts,
            ].map((attempt) => [attempt.itemId, attempt]),
          ).values(),
        ],
      },
    };
  } catch (error) {
    if (error instanceof Error)
      process.stderr.write(
        `${JSON.stringify({ kind: "editorial_v2_invalid", runId: audit.runId, error: error.message })}\n`,
      );
    return { kind: "blocked", reason: "editorial_v2_invalid" };
  }
}
