// Deterministic 5-dimension research quality scoring for a rendered
// ResearchFileData (public-facing report text + structured claims), built on
// top of evaluateResearchQuality (src/research/domain/researchQualityEvaluator.ts).
//
// Extracted from scripts/run-research-quality-live.ts so both the live
// (paid-key, 2-symbol) harness and the offline sqlite backfill
// (scripts/quality-timeseries.ts) share one scoring path instead of
// maintaining duplicated copies — see
// asm/plutia-labs/stocksembly/2026-08-31-품질측정-설계.md §5 작업 #1.
//
// This is a pure, deterministic mapping (no fs/network/DB access) so it is
// safe to import from both a Node script and, if ever needed, a worker
// bundle.
import type { ResearchFileData } from "../compositions/types";
import {
  evaluateResearchQuality,
  ResearchQualityFixtureSchema,
} from "../domain/researchQualityEvaluator";

export function publicTexts(
  file: ResearchFileData,
  locale: "en" | "ko",
): readonly string[] {
  return [
    file.thesis[locale],
    file.condition[locale],
    file.expectation[locale],
    file.valuation[locale],
    file.nextEvent[locale],
    file.changeCondition[locale],
    ...file.positives.map((v) => v[locale]),
    ...file.concerns.map((v) => v[locale]),
    ...file.analysis.flatMap((v) => [v.summary[locale], v.detail[locale]]),
    ...file.teamViews.flatMap((v) => [v.position[locale], v.rationale[locale]]),
    ...(file.structuredEditorial === undefined
      ? []
      : [
          file.structuredEditorial.decision.decisiveReason[locale],
          file.structuredEditorial.decision.strongestCountercase[locale],
          file.structuredEditorial.decision.falsifier[locale],
          ...file.structuredEditorial.claims.flatMap((v) => [
            v.publicThesis[locale],
            v.falsifier[locale],
          ]),
        ]),
  ];
}

export function liveQuality(file: ResearchFileData, sourceLocale: "en" | "ko") {
  const claims = file.claimMatrix ?? [];
  const sources = new Map(
    file.evidenceIndex.map((source) => [source.id, source]),
  );
  const material = claims.filter(
    (claim) => claim.decisionDimension !== undefined,
  );
  const texts = publicTexts(file, sourceLocale);
  const precisionSamples = texts.flatMap((text) =>
    [...text.matchAll(/-?\d+\.\d+%?/gu)].map((match) => ({
      kind: match[0].endsWith("%")
        ? ("percentage" as const)
        : ("ratio" as const),
      text: match[0],
    })),
  );
  const comparators = file.structuredEditorial?.comparators ?? [];
  const scenarioRanks = new Map([
    ["downside", 0],
    ["base", 1],
    ["upside", 2],
  ]);
  const rankedScenarios = file.scenarios.filter((scenario) =>
    scenarioRanks.has(scenario.id),
  );
  const orderedScenarios = rankedScenarios.every(
    (scenario, index, all) =>
      index === 0 ||
      (scenarioRanks.get(all[index - 1]?.id ?? "") ?? -1) <
        (scenarioRanks.get(scenario.id) ?? -1),
  );
  const decision = file.structuredEditorial?.decision;
  const decisiveFacts = (material.length === 0 ? claims : material).map(
    (claim) => ({
      verdict: claim.verdict,
      exactSourceUrl:
        claim.sourceRefs
          .map((id) => sources.get(id)?.url)
          .find((url) => url !== undefined) ?? "",
    }),
  );
  const fixture = ResearchQualityFixtureSchema.parse({
    id: "bounded-live-report",
    issuerResolved: true,
    peerResult: {
      emitted: comparators.length >= 3,
      rows: comparators.map(() => ({ qualified: true })),
    },
    scenarios: [
      {
        ordered: orderedScenarios,
        assumptionsComplete: file.scenarios.every((scenario) =>
          scenario.assumptions.every(
            (assumption) =>
              assumption.kind === "unverified" ||
              assumption.sourceRefs.length > 0,
          ),
        ),
      },
    ],
    coreClaims: (material.length === 0 ? claims : material).map((claim) => ({
      assessable: claim.verdict !== "not_assessable",
    })),
    coreSections: [
      file.thesis[sourceLocale],
      file.expectation[sourceLocale],
      file.valuation[sourceLocale],
    ],
    publicTexts: texts,
    precisionSamples,
    decisiveFacts,
    decisiveAnalyses: (material.length === 0 ? claims : material).map(
      (claim) => ({
        verdict:
          claim.verdict === "entailed" ? "derived_supported" : claim.verdict,
        inputIds: claim.sourceRefs,
        eligibleInputIds: claim.verdict === "entailed" ? claim.sourceRefs : [],
      }),
    ),
    groundedCoreAnswer: claims.some((claim) => claim.verdict === "entailed"),
    wholeEnvelopeIntegrity: true,
    scoreEvidence: {
      directDirectionalAnswer:
        decision?.stance === "upside_skewed" ||
        decision?.stance === "downside_skewed",
      strongestCountercase:
        (decision?.strongestCountercase[sourceLocale].trim().length ?? 0) > 0,
      invalidationCondition:
        (decision?.falsifier[sourceLocale].trim().length ?? 0) > 0,
      stanceInFirstSentence:
        (decision?.decisiveReason[sourceLocale].trim().length ?? 0) > 0,
      limitationsBlockCount:
        file.limitationNote[sourceLocale].trim().length > 0 ? 1 : 0,
      limitationsItemCount:
        file.limitationNote[sourceLocale].trim().length > 0 ? 1 : 0,
      crossSectionThesisDuplicate:
        new Set(texts.map((text) => text.trim())).size !== texts.length,
      mixedQualityFailSoftCompletion: true,
      sourceLocaleCacheContract: true,
      atomicPublication: true,
    },
    expectedFatalReasons: [],
    expectedScoreComponents: {
      decisionUsefulness: 0,
      evidenceTraceability: 0,
      comparatorValuationDiscipline: 0,
      editorialClarity: 0,
      reliability: 0,
    },
    expectedRuntimeDisposition: "complete",
  });
  return evaluateResearchQuality(fixture);
}
