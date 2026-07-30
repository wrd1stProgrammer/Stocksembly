import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { evaluatePublicationQuality } from "../domain/qualityPolicy";
import { ResearchReportSchema } from "../domain/report";
import { SourceRegisterEntrySchema } from "../domain/reportComponents";
import { SemanticAuditSchema } from "../domain/reportSemantic";
import { normalizeReportNarrativeText } from "../domain/reportText";
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
  const reportLocale = input.locale ?? "en";
  const selectedText = (value: {
    readonly en: string;
    readonly ko: string;
  }) => {
    const text = value[reportLocale];
    return { en: text, ko: text };
  };
  const structural = StructuralAuditArtifactEnvelopeSchema.safeParse(
    input.structuralAudit,
  );
  const semantic = SemanticAuditSchema.safeParse(input.semanticAudit);
  const chair = ChairSynthesisOutputSchema.safeParse(input.chair);
  if (!structural.success || !semantic.success || !chair.success)
    return { kind: "blocked", reason: "invalid_input" };
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
  const chairClaimIds = new Set<string>([
    ...auditedClaimIds,
    ...audit.retainedDissentClaimIds,
  ]);
  const chairReason = chairValidationReason({
    chair: chair.data,
    sentences: input.chairSentences,
    auditedClaimIds: chairClaimIds,
    retainedDissentClaimIds: audit.retainedDissentClaimIds,
    retainedOpenQuestionCount: audit.retainedOpenQuestions.length,
  });
  if (chairReason !== undefined)
    return { kind: "blocked", reason: chairReason };
  const verdicts = new Map<string, (typeof semantic.data.verdicts)[number]>(
    semantic.data.verdicts.map((verdict) => [verdict.claimId, verdict]),
  );
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
  for (const claimId of audit.retainedDissentClaimIds)
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
  if (
    input.chairScenarioIds.length !== audit.scenarios.length ||
    scenarios.length !== audit.scenarios.length ||
    scenarios.length === 0
  )
    return { kind: "blocked", reason: "scenario_invalid" };
  const sections = chair.data.sections.map((section) => ({
    id: section.sectionKey,
    title: SECTION_TITLES[section.sectionKey],
    body: section.publicSummary,
    claimIds: section.auditedClaimIds,
    sourceIds: section.sourceArtifactIds,
  }));
  const dissent = audit.retainedDissentClaimIds.map((claimId) => {
    const sentences = input.chairSentences.filter(
      (sentence) =>
        sentence.kind === "dissent" && sentence.claimIds.includes(claimId),
    );
    return {
      claimId,
      sourceIds: [
        ...new Set(sentences.flatMap((sentence) => sentence.sourceArtifactIds)),
      ],
      text: selectedText({
        en: sentences.map((sentence) => sentence.text.en).join(" "),
        ko: sentences.map((sentence) => sentence.text.ko).join(" "),
      }),
    };
  });
  if (dissent.some((entry) => entry.text.en === "" || entry.text.ko === ""))
    return { kind: "blocked", reason: "retention_mismatch" };
  const locales = localizedReport({
    sections,
    scenarios,
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
    ...claims
      .filter(
        (claim) =>
          claim.semanticVerdict === "partial" ||
          claim.semanticVerdict === "not_assessable",
      )
      .map((claim) => ({
        id: `limitation:claim:${claim.claimId}`,
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
    claims: claims.map((claim) => ({
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
      addedClaimIds: claims
        .filter((claim) => !priorClaimIds.has(claim.claimId))
        .map((claim) => claim.claimId),
      removedClaimIds: [...priorClaimIds].filter(
        (claimId) => !claims.some((claim) => claim.claimId === claimId),
      ),
    },
    claims,
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
  return { kind: "assembled", report: report.data };
}
