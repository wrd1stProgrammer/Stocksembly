import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import ky from "ky";
import { z } from "zod";
import { createResearchClient } from "../src/research/client/api";
import { PublicRunDetailSchema } from "../src/research/client/schemas";
import type { ResearchFileData } from "../src/research/compositions/types";
import {
  evaluateResearchQuality,
  ResearchQualityFixtureSchema,
} from "../src/research/domain/researchQualityEvaluator";
import { ResearchQualityMetricsSchema } from "../src/research/server/persistence/sqlite/researchQualityObservations";
import { loadResearchRoomReport } from "../src/research/server/researchRoom/researchRoomCatalog";
import {
  publicResearchTranslationItems,
  RESEARCH_TRANSLATION_SCHEMA_VERSION,
  type ResearchTranslationCacheKey,
  researchTranslationModelCalls,
} from "../src/research/server/researchRoom/researchRoomLocalizations";
import {
  planResearchTranslationBatches,
  RESEARCH_TRANSLATION_MODEL_VERSION,
} from "../src/research/server/researchRoom/researchTranslationRunner";

const EnvSchema = z.object({
  RUN_LIVE_RESEARCH: z.literal("1"),
  STOCKSEMBLY_DATA_DIR: z.string().startsWith("/tmp/stocksembly-quality."),
  RESEARCH_AUTOMATION_TOKEN_PATH: z.string().min(1),
  QUALITY_RUN_LEDGER: z.string().min(1),
  RESEARCH_QUALITY_EVIDENCE_DIR: z.string().min(1),
  STOCKSEMBLY_PUBLIC_ORIGIN: z.literal("http://127.0.0.1:3000"),
});
const TERMINAL = new Set([
  "completed",
  "complete-with-limitations",
  "failed",
  "incomplete",
  "cancelled",
]);
const ReportProofRowSchema = z.object({
  version: z.number().int().positive(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/u),
  byte_length: z.number().int().positive(),
  published_at: z.string().datetime(),
  outcome: z.string().nullable(),
  metrics_json: z.string().nullable(),
  reason_codes_json: z.string().nullable(),
});
const UsageRowSchema = z.object({
  modelCalls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
const TerminalEventRowSchema = z.object({ payload_json: z.string() });
const TerminalPayloadSchema = z.looseObject({
  code: z.string().min(1).optional(),
  summary: z
    .object({ en: z.string().optional(), ko: z.string().optional() })
    .optional(),
});
const LedgerBaseEntrySchema = z.object({
  symbol: z.enum(["NVDA", "TSLA"]),
  runId: z.string().uuid(),
  terminalReason: z.string().min(1).nullable(),
  chargeDisposition: z.enum(["charged", "not_charged", "unknown"]),
  scorecardPath: z.string().min(1),
});
const FailedLedgerEntrySchema = LedgerBaseEntrySchema.extend({
  terminalStatus: z.enum([
    "queued",
    "running",
    "cancelling",
    "completed",
    "complete-with-limitations",
    "failed",
    "incomplete",
    "cancelled",
  ]),
  reportId: z.null(),
  reportUrl: z.null(),
  score: z.null(),
  scoreStatus: z.literal("not_computable"),
});
const PublishedLedgerEntrySchema = LedgerBaseEntrySchema.extend({
  terminalStatus: z.enum(["completed", "complete-with-limitations"]),
  reportId: z.string().uuid(),
  reportUrl: z.string().startsWith("/research/"),
  score: z.number().min(0).max(10),
  scoreStatus: z.literal("computed"),
  sourceUrls: z.array(z.string().url()).min(2),
  sourceLocale: z.enum(["en", "ko"]),
  translationTarget: z.literal("ko"),
  reportContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  reportByteLength: z.number().int().positive(),
  publishedAt: z.string().datetime(),
  fatalDefects: z.array(z.string()),
  scorecardMarkdownPath: z.string().min(1),
});
const LedgerEntrySchema = z.discriminatedUnion("scoreStatus", [
  FailedLedgerEntrySchema,
  PublishedLedgerEntrySchema,
]);
const BrowserProofSchema = z
  .discriminatedUnion("status", [
    z.object({
      status: z.literal("passed"),
      runIds: z.array(z.string().uuid()).length(2),
    }),
    z.object({
      status: z.literal("skipped_no_published_reports"),
      runIds: z.array(z.string().uuid()).length(0),
    }),
  ])
  .nullable();
export const TranslationProofSchema = z
  .strictObject({
    cacheKey: z.strictObject({
      reportId: z.string().uuid(),
      reportVersion: z.number().int().positive(),
      sourceContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
      sourceLocale: z.enum(["en", "ko"]),
      targetLocale: z.literal("ko"),
      translationSchemaVersion: z.number().int().positive(),
      modelVersion: z.string().trim().min(1),
    }),
    expectedBatchCount: z.number().int().positive(),
    batches: z
      .array(
        z.strictObject({
          ordinal: z.number().int().positive(),
          inputHash: z.string().regex(/^[a-f0-9]{64}$/u),
        }),
      )
      .min(1),
    counterSnapshots: z.strictObject({
      beforeFirst: z.number().int().nonnegative(),
      afterFirst: z.number().int().nonnegative(),
      beforeSecond: z.number().int().nonnegative(),
      afterSecond: z.number().int().nonnegative(),
    }),
    durableRows: z
      .array(
        z.strictObject({
          invocationId: z.string().uuid(),
          batchOrdinal: z.number().int().positive(),
          batchInputHash: z.string().regex(/^[a-f0-9]{64}$/u),
          outcome: z.literal("succeeded"),
        }),
      )
      .min(1),
  })
  .superRefine((proof, context) => {
    const plannedKeys = proof.batches.map(
      ({ ordinal, inputHash }) => `${ordinal}:${inputHash}`,
    );
    const durableKeys = proof.durableRows.map(
      ({ batchOrdinal, batchInputHash }) =>
        `${batchOrdinal}:${batchInputHash}`,
    );
    const expectedOrdinals = Array.from(
      { length: proof.expectedBatchCount },
      (_, index) => index + 1,
    );
    const actualOrdinals = proof.batches.map(({ ordinal }) => ordinal);
    const sortedPlannedKeys = [...plannedKeys].sort();
    const sortedDurableKeys = [...durableKeys].sort();
    const countersMatch =
      proof.counterSnapshots.afterFirst -
          proof.counterSnapshots.beforeFirst ===
        proof.expectedBatchCount &&
      proof.counterSnapshots.beforeSecond ===
        proof.counterSnapshots.afterFirst &&
      proof.counterSnapshots.afterSecond ===
        proof.counterSnapshots.beforeSecond;
    const rowsMatchPlan =
      proof.batches.length === proof.expectedBatchCount &&
      proof.durableRows.length === proof.expectedBatchCount &&
      new Set(plannedKeys).size === proof.expectedBatchCount &&
      new Set(durableKeys).size === proof.expectedBatchCount &&
      sortedPlannedKeys.every(
        (plannedKey, index) => plannedKey === sortedDurableKeys[index],
      ) &&
      actualOrdinals.every(
        (ordinal, index) => ordinal === expectedOrdinals[index],
      );
    if (!countersMatch)
      context.addIssue({
        code: "custom",
        path: ["counterSnapshots"],
        message: "TRANSLATION_COUNTERS_MUST_PROVE_CACHE_REUSE",
      });
    if (!rowsMatchPlan)
      context.addIssue({
        code: "custom",
        path: ["durableRows"],
        message: "DURABLE_ROWS_MUST_MATCH_PLANNED_BATCHES_EXACTLY_ONCE",
      });
  })
  .nullable();
export const LiveLedgerSchema = z
  .object({
    schemaVersion: z.literal(2),
    invocationId: z.string().uuid(),
    createdAt: z.string().datetime(),
    immutable: z.literal(true),
    passed: z.boolean(),
    outcome: z.enum([
      "accepted",
      "bounded_failure_report",
      "evidence_incomplete",
    ]),
    entries: z.array(LedgerEntrySchema).length(2),
    browserProof: BrowserProofSchema,
    translationProof: TranslationProofSchema,
  })
  .superRefine((ledger, context) => {
    const symbols = new Set(ledger.entries.map(({ symbol }) => symbol));
    const requiredSymbolsPresent =
      symbols.size === 2 && symbols.has("NVDA") && symbols.has("TSLA");
    const acceptedEntries = ledger.entries.every(
      (entry) =>
        entry.scoreStatus === "computed" &&
        entry.score >= 8 &&
        entry.fatalDefects.length === 0,
    );
    const entryRunIds = ledger.entries.map(({ runId }) => runId).sort();
    const browserRunIds =
      ledger.browserProof?.status === "passed"
        ? [...ledger.browserProof.runIds].sort()
        : [];
    const browserProofComplete =
      browserRunIds.length === entryRunIds.length &&
      browserRunIds.every((runId, index) => runId === entryRunIds[index]);
    const translationProofComplete =
      ledger.translationProof !== null &&
      ledger.entries.some(
        (entry) =>
          entry.scoreStatus === "computed" &&
          entry.reportId === ledger.translationProof?.cacheKey.reportId &&
          entry.reportContentHash ===
            ledger.translationProof.cacheKey.sourceContentHash &&
          entry.sourceLocale === ledger.translationProof.cacheKey.sourceLocale,
      );
    const acceptanceComplete =
      requiredSymbolsPresent &&
      acceptedEntries &&
      browserProofComplete &&
      translationProofComplete;
    const hasUnpublishedEntry = ledger.entries.some(
      (entry) => entry.scoreStatus === "not_computable",
    );
    const expectedOutcome = ledger.passed
      ? "accepted"
      : hasUnpublishedEntry
        ? "bounded_failure_report"
        : "evidence_incomplete";
    if (ledger.passed && !acceptanceComplete)
      context.addIssue({
        code: "custom",
        path: ["passed"],
        message: "PASS_REQUIRES_COMPLETE_RUN_BOUND_PROOF",
      });
    if (ledger.outcome !== expectedOutcome)
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "OUTCOME_MUST_MATCH_LEDGER_EVIDENCE",
      });
  });
type LiveLedger = z.infer<typeof LiveLedgerSchema>;
type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
type PublishedLedgerEntry = z.infer<typeof PublishedLedgerEntrySchema>;

export function publishedLedgerEntries(
  ledger: LiveLedger,
): readonly PublishedLedgerEntry[] {
  return ledger.entries.filter(
    (entry): entry is PublishedLedgerEntry => entry.scoreStatus === "computed",
  );
}
const RUNS = [
  {
    symbol: "NVDA" as const,
    question:
      "For a medium-horizon investor, assess NVIDIA earnings durability and valuation. Compare the evidence-backed upside and downside, and give a directional stance with explicit invalidation checkpoints.",
    purpose: "earnings" as const,
  },
  {
    symbol: "TSLA" as const,
    question:
      "For a medium-horizon investor, assess Tesla business quality and valuation. Compare the evidence-backed upside and downside, and give a directional stance with explicit invalidation checkpoints.",
    purpose: "new_entry" as const,
  },
] as const;

function publicTexts(
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

function liveQuality(file: ResearchFileData, sourceLocale: "en" | "ko") {
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

function terminalEvidence(
  database: Database.Database,
  runId: string,
): {
  readonly terminalReason: string | null;
  readonly chargeDisposition: "not_charged" | "unknown";
} {
  const row = TerminalEventRowSchema.safeParse(
    database
      .prepare(
        "SELECT payload_json FROM run_events WHERE run_id = ? ORDER BY sequence DESC LIMIT 1",
      )
      .get(runId),
  );
  if (!row.success)
    return { terminalReason: null, chargeDisposition: "unknown" };
  const payload = TerminalPayloadSchema.safeParse(
    JSON.parse(row.data.payload_json),
  );
  if (!payload.success)
    return { terminalReason: null, chargeDisposition: "unknown" };
  const noCharge = payload.data.summary?.en
    ?.toLocaleLowerCase("en")
    .includes("no research credit was charged");
  return {
    terminalReason: payload.data.code ?? null,
    chargeDisposition: noCharge === true ? "not_charged" : "unknown",
  };
}

async function writeImmutableJson(
  outputPath: string,
  value: unknown,
): Promise<void> {
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

async function replaceJsonPointer(
  outputPath: string,
  invocationId: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${invocationId}.tmp`;
  await writeImmutableJson(temporaryPath, value);
  await rename(temporaryPath, outputPath);
}

async function main(): Promise<void> {
  const env = EnvSchema.parse(process.env);
  const evidenceDir = path.resolve(env.RESEARCH_QUALITY_EVIDENCE_DIR);
  const ledgerPath = path.resolve(env.QUALITY_RUN_LEDGER);
  const databasePath = path.join(env.STOCKSEMBLY_DATA_DIR, "research.sqlite");
  const invocationId = randomUUID();
  const invocationDir = path.join(evidenceDir, "invocations", invocationId);
  await mkdir(path.join(invocationDir, "scorecards"), { recursive: true });
  await mkdir(path.join(invocationDir, "report-artifacts"), {
    recursive: true,
  });
  const token = (
    await readFile(env.RESEARCH_AUTOMATION_TOKEN_PATH, "utf8")
  ).trim();
  const authorization = `Bearer ${token}`;
  const client = createResearchClient({
    prefixUrl: env.STOCKSEMBLY_PUBLIC_ORIGIN,
    headers: {
      authorization,
      origin: env.STOCKSEMBLY_PUBLIC_ORIGIN,
      "sec-fetch-site": "same-origin",
    },
  });
  const started = await Promise.all(
    RUNS.map(async (definition) => ({
      definition,
      detail: await client.startRun({
        symbol: definition.symbol,
        question: definition.question,
        locale: "en",
        researchTarget: { kind: "committee" },
        researchProfile: {
          investmentHorizon: "medium",
          counterargumentIntensity: "strong",
          analysisDepth: "deep",
          explanationMode: "professional",
          decisionPurpose: definition.purpose,
          comparisonSymbols: [],
        },
        idempotencyKey: `quality-live-${definition.symbol.toLowerCase()}-${Date.now()}`,
      }),
    })),
  );
  const completed = await Promise.all(
    started.map(async ({ definition, detail }) => {
      const deadline = Date.now() + 7_200_000;
      let current = detail;
      while (!TERMINAL.has(current.run.status) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        current = PublicRunDetailSchema.parse(
          await client.getRun(detail.run.runId),
        );
      }
      return { definition, detail: current };
    }),
  );
  const database = new Database(databasePath, { readonly: true });
  const entries: LedgerEntry[] = [];
  for (const value of completed) {
    const runId = value.detail.run.runId;
    const terminal = terminalEvidence(database, runId);
    const terminalReason =
      terminal.terminalReason ??
      (TERMINAL.has(value.detail.run.status)
        ? null
        : "harness_deadline_exceeded");
    const reportId = value.detail.run.reportId;
    if (
      (value.detail.run.status !== "completed" &&
        value.detail.run.status !== "complete-with-limitations") ||
      reportId === undefined
    ) {
      const scorecardPath = path.join(
        invocationDir,
        "scorecards",
        `${value.definition.symbol.toLowerCase()}-${runId}.json`,
      );
      const scorecard = {
        schemaVersion: 2,
        symbol: value.definition.symbol,
        runId,
        terminalStatus: value.detail.run.status,
        terminalReason,
        chargeDisposition: terminal.chargeDisposition,
        reportId: null,
        score: null,
        scoreStatus: "not_computable" as const,
        passed: false,
        scoreReason: "No report was published for this exact run ID.",
      };
      await writeImmutableJson(scorecardPath, scorecard);
      entries.push(
        FailedLedgerEntrySchema.parse({
          symbol: value.definition.symbol,
          runId,
          terminalStatus: value.detail.run.status,
          terminalReason,
          chargeDisposition: terminal.chargeDisposition,
          reportId: null,
          reportUrl: null,
          score: null,
          scoreStatus: "not_computable",
          scorecardPath,
        }),
      );
      continue;
    }
    const report = await loadResearchRoomReport(
      reportId,
      { authenticated: true, tier: "free" },
      new Date(),
      "en",
    );
    if (report === undefined || report === "locked")
      throw new TypeError(`${value.definition.symbol}_REPORT_UNAVAILABLE`);
    const row = ReportProofRowSchema.parse(
      database
        .prepare(`SELECT report_versions.version, artifacts.content_hash, artifacts.byte_length,
      report_versions.published_at, research_quality_observations.outcome, research_quality_observations.metrics_json,
      research_quality_observations.reason_codes_json FROM report_versions JOIN artifacts USING(artifact_id)
      LEFT JOIN research_quality_observations USING(run_id) WHERE report_versions.run_id = ? ORDER BY version DESC LIMIT 1`)
        .get(runId),
    );
    const sourceUrls = report.file.evidenceIndex.flatMap((source) =>
      source.url === undefined ? [] : [source.url],
    );
    if (sourceUrls.length < 2)
      throw new TypeError(
        `${value.definition.symbol}_TWO_SOURCE_URLS_REQUIRED`,
      );
    const quality = liveQuality(report.file, report.item.locale);
    const usage = UsageRowSchema.parse(
      database
        .prepare(`SELECT
          (SELECT COUNT(*) FROM agent_runner_evidence JOIN attempts USING(attempt_id) WHERE attempts.run_id = @runId) +
          (SELECT COUNT(*) FROM auxiliary_codex_usage WHERE run_id = @runId) AS modelCalls,
          COALESCE((SELECT SUM(input_tokens) FROM agent_runner_evidence JOIN attempts USING(attempt_id) WHERE attempts.run_id = @runId), 0) +
          COALESCE((SELECT SUM(input_tokens) FROM auxiliary_codex_usage WHERE run_id = @runId), 0) AS inputTokens,
          COALESCE((SELECT SUM(output_tokens) FROM agent_runner_evidence JOIN attempts USING(attempt_id) WHERE attempts.run_id = @runId), 0) +
          COALESCE((SELECT SUM(output_tokens) FROM auxiliary_codex_usage WHERE run_id = @runId), 0) AS outputTokens`)
        .get({ runId }),
    );
    const artifactHash = row.content_hash;
    const artifactPath = path.join(
      env.STOCKSEMBLY_DATA_DIR,
      "artifacts",
      "sha256",
      artifactHash.slice(0, 2),
      artifactHash.slice(2),
    );
    const artifactBytes = await readFile(artifactPath);
    if (
      createHash("sha256").update(artifactBytes).digest("hex") !== artifactHash
    )
      throw new TypeError("REPORT_ARTIFACT_HASH_MISMATCH");
    const scorecardPath = path.join(
      invocationDir,
      "scorecards",
      `${value.definition.symbol.toLowerCase()}-${runId}.json`,
    );
    const metrics =
      row.metrics_json === null
        ? null
        : ResearchQualityMetricsSchema.parse(JSON.parse(row.metrics_json));
    const chargeDisposition =
      (metrics?.modelCostUsd ?? 0) + (metrics?.dataCostUsd ?? 0) > 0
        ? ("charged" as const)
        : terminal.chargeDisposition;
    const omittedItemReasons =
      row.reason_codes_json === null
        ? []
        : z.array(z.string()).parse(JSON.parse(row.reason_codes_json));
    const acceptanceDefects = [
      ...quality.fatalReasons,
      ...(report.file.structuredEditorial?.decision.stance ===
        "upside_skewed" ||
      report.file.structuredEditorial?.decision.stance === "downside_skewed"
        ? []
        : ["directional_stance_missing"]),
    ];
    const semanticVerdicts = (report.file.claimMatrix ?? []).map(
      (claim) => claim.verdict,
    );
    const semanticVerdictDistribution = Object.fromEntries(
      [...new Set(semanticVerdicts)].map((verdict) => [
        verdict,
        semanticVerdicts.filter((candidate) => candidate === verdict).length,
      ]),
    );
    const scorecard = {
      schemaVersion: 2,
      symbol: value.definition.symbol,
      runId,
      reportId,
      terminalStatus: value.detail.run.status,
      terminalReason,
      chargeDisposition,
      sourceLocale: report.item.locale,
      translationTarget: "ko",
      totalScore: quality.totalScore,
      scoreStatus: "computed",
      passed: quality.totalScore >= 8 && acceptanceDefects.length === 0,
      fatalDefects: acceptanceDefects,
      predicates: quality.predicates,
      scoreComponents: quality.scoreComponents,
      semanticVerdictDistribution,
      omittedItemReasons,
      qualityObservation: metrics,
      latencyMs: metrics?.latencyMs ?? null,
      modelCallCount: usage.modelCalls,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      modelCostUsd: metrics?.modelCostUsd ?? null,
      dataCostUsd: metrics?.dataCostUsd ?? null,
      sourceUrls,
    };
    await writeImmutableJson(scorecardPath, scorecard);
    await writeFile(
      scorecardPath.replace(/\.json$/u, ".md"),
      `# ${value.definition.symbol} live quality scorecard\n\n- Score: ${quality.totalScore.toFixed(2)}/10\n- Fatal defects: ${acceptanceDefects.join(", ") || "none"}\n- Model calls: ${usage.modelCalls}\n- Sources: ${sourceUrls.length}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(
      path.join(
        invocationDir,
        "report-artifacts",
        `${value.definition.symbol}-${runId}.json`,
      ),
      artifactBytes,
      { flag: "wx" },
    );
    entries.push({
      symbol: value.definition.symbol,
      runId,
      terminalStatus: value.detail.run.status,
      terminalReason,
      chargeDisposition,
      reportId,
      reportUrl: `/research/${value.definition.symbol}?run=${runId}&lang=en`,
      sourceUrls,
      sourceLocale: report.item.locale,
      translationTarget: "ko" as const,
      reportContentHash: artifactHash,
      reportByteLength: row.byte_length,
      publishedAt: row.published_at,
      score: quality.totalScore,
      scoreStatus: "computed",
      fatalDefects: acceptanceDefects,
      scorecardPath,
      scorecardMarkdownPath: scorecardPath.replace(/\.json$/u, ".md"),
    });
  }
  database.close();
  const selectedEntry = entries.find(
    (entry): entry is PublishedLedgerEntry => entry.scoreStatus === "computed",
  );
  let translationProof: unknown = null;
  if (selectedEntry !== undefined) {
    const translationReport = await loadResearchRoomReport(
      selectedEntry.reportId,
      { authenticated: true, tier: "free" },
      new Date(),
      "en",
    );
    if (translationReport === undefined || translationReport === "locked")
      throw new TypeError("TRANSLATION_REPORT_REQUIRED");
    const cacheKey: ResearchTranslationCacheKey = {
      reportId: selectedEntry.reportId,
      reportVersion: translationReport.version,
      sourceContentHash: selectedEntry.reportContentHash,
      sourceLocale: translationReport.item.locale,
      targetLocale: "ko",
      translationSchemaVersion: RESEARCH_TRANSLATION_SCHEMA_VERSION,
      modelVersion: RESEARCH_TRANSLATION_MODEL_VERSION,
    };
    const batches = planResearchTranslationBatches(
      publicResearchTranslationItems(
        translationReport.file,
        translationReport.item.question,
        translationReport.runDetail,
        translationReport.conversation,
        translationReport.item.locale,
      ),
    );
    const beforeFirst = researchTranslationModelCalls(
      databasePath,
      cacheKey,
    ).length;
    const translationUrl = `${env.STOCKSEMBLY_PUBLIC_ORIGIN}/api/research-room/${selectedEntry.reportId}/translation`;
    await ky
      .post(translationUrl, {
        headers: {
          authorization,
          origin: env.STOCKSEMBLY_PUBLIC_ORIGIN,
          "sec-fetch-site": "same-origin",
        },
        json: { targetLocale: "ko" },
        timeout: false,
        retry: 0,
      })
      .json();
    const afterFirstRows = researchTranslationModelCalls(
      databasePath,
      cacheKey,
    );
    const beforeSecond = afterFirstRows.length;
    await ky
      .post(translationUrl, {
        headers: {
          authorization,
          origin: env.STOCKSEMBLY_PUBLIC_ORIGIN,
          "sec-fetch-site": "same-origin",
        },
        json: { targetLocale: "ko" },
        timeout: false,
        retry: 0,
      })
      .json();
    const afterSecond = researchTranslationModelCalls(
      databasePath,
      cacheKey,
    ).length;
    translationProof = {
      cacheKey,
      expectedBatchCount: batches.length,
      batches: batches.map(({ ordinal, inputHash }) => ({
        ordinal,
        inputHash,
      })),
      counterSnapshots: {
        beforeFirst,
        afterFirst: afterFirstRows.length,
        beforeSecond,
        afterSecond,
      },
      durableRows: afterFirstRows,
    };
    const batchKeys = batches.map(({ ordinal, inputHash }) => [
      ordinal,
      inputHash,
    ]);
    const durableKeys = afterFirstRows.map(
      ({ batchOrdinal, batchInputHash }) => [batchOrdinal, batchInputHash],
    );
    if (
      afterFirstRows.length - beforeFirst !== batches.length ||
      beforeSecond !== afterFirstRows.length ||
      afterSecond !== beforeSecond ||
      JSON.stringify(durableKeys) !== JSON.stringify(batchKeys) ||
      afterFirstRows.some(({ outcome }) => outcome !== "succeeded")
    )
      throw new TypeError("TRANSLATION_CACHE_PROOF_FAILED");
  }
  const hasUnpublishedEntry = entries.some(
    (entry) => entry.scoreStatus === "not_computable",
  );
  const browserProof = hasUnpublishedEntry
    ? entries.every((entry) => entry.scoreStatus === "not_computable")
      ? { status: "skipped_no_published_reports" as const, runIds: [] }
      : null
    : null;
  const passed = false;
  const ledger = LiveLedgerSchema.parse({
    schemaVersion: 2,
    invocationId,
    createdAt: new Date().toISOString(),
    immutable: true,
    passed,
    outcome: hasUnpublishedEntry
      ? "bounded_failure_report"
      : "evidence_incomplete",
    entries,
    browserProof,
    translationProof,
  });
  const invocationLedgerPath = path.join(invocationDir, "ledger.json");
  await writeImmutableJson(invocationLedgerPath, ledger);
  await replaceJsonPointer(ledgerPath, invocationId, {
    ...ledger,
    invocationLedgerPath,
  });
  process.stdout.write(`${JSON.stringify(ledger, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(entryPath)).href
)
  await main();
