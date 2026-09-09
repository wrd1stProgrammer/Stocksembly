// Recalculate published report quality from a local research.sqlite copy and
// its artifacts. Writes dated JSON + Markdown without changing the source DB.
// Uses the shared liveQuality scorer; see scripts/README.md.
//
// From the repository root with the project's Node 20 runtime:
//   pnpm exec vite build --config vite.worker.config.ts --ssr scripts/quality-timeseries.ts --outDir .stocksembly-verification/quality-timeseries-cli
//   STOCKSEMBLY_DATA_DIR=/absolute/path/to/research-copy node .stocksembly-verification/quality-timeseries-cli/quality-timeseries.js [outputDir]
//
// Default output: .stocksembly-verification/quality-archive (gitignored).
// There is no research:quality:archive package script.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import {
  WorkflowV2ResearchReportSchema,
  WorkflowV3ResearchReportSchema,
} from "../src/research/domain/report";
import type {
  QualityFatalReason,
  QualityScoreComponents,
} from "../src/research/domain/researchQualityEvaluator";
import { liveQuality } from "../src/research/quality/liveReportQuality";
import { researchReportToFile } from "../src/research/researchReportToFile";
import { readResearchQualityObservation } from "../src/research/server/persistence/sqlite/researchQualityObservations";

const outputArgument = process.argv[2];
const outputDir = path.resolve(
  outputArgument ?? path.join(".stocksembly-verification", "quality-archive"),
);
const dataRoot =
  process.env["STOCKSEMBLY_DATA_DIR"] ??
  path.join(
    process.env["HOME"] ?? "",
    "Library",
    "Application Support",
    "Stocksembly",
    "research",
  );
const databasePath = path.join(dataRoot, "research.sqlite");
// Display-only: mask the local filesystem root (includes the running
// user's home directory) so committed summary.md files don't leak whoever
// happened to generate them. Doesn't affect scoring, hashing, or the JSON
// archive — only this printed line.
const maskedDatabasePath = path.join(
  "$STOCKSEMBLY_DATA_DIR",
  "research.sqlite",
);
const database = new Database(databasePath, { readonly: true });

const ReportVersionRowSchema = z.object({
  version_id: z.string(),
  report_id: z.string(),
  run_id: z.string(),
  version: z.number(),
  status: z.enum(["complete", "complete_with_limitations", "incomplete"]),
  published_at: z.string(),
  run_status: z.string(),
  run_created_at: z.string(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/u),
  byte_length: z.number(),
  symbol: z.string(),
  locale: z.enum(["en", "ko"]),
  research_kind: z.enum(["committee", "department"]),
  department_id: z.enum(["market", "company", "financial", "risk"]).nullable(),
});
type ReportVersionRow = z.infer<typeof ReportVersionRowSchema>;

const rows: ReportVersionRow[] = database
  .prepare(`
    SELECT
      report_versions.version_id AS version_id,
      report_versions.report_id AS report_id,
      report_versions.run_id AS run_id,
      report_versions.version AS version,
      report_versions.status AS status,
      report_versions.published_at AS published_at,
      runs.status AS run_status,
      runs.created_at AS run_created_at,
      artifacts.content_hash AS content_hash,
      artifacts.byte_length AS byte_length,
      research_requests.symbol AS symbol,
      research_requests.locale AS locale,
      research_requests.research_kind AS research_kind,
      research_requests.department_id AS department_id
    FROM report_versions
    JOIN runs ON runs.run_id = report_versions.run_id
    JOIN artifacts ON artifacts.artifact_id = report_versions.artifact_id
    JOIN research_requests ON research_requests.run_id = report_versions.run_id
    ORDER BY report_versions.published_at ASC
  `)
  .all()
  .map((row) => ReportVersionRowSchema.parse(row));

type ScoredRun = {
  readonly runId: string;
  readonly reportId: string;
  readonly versionId: string;
  readonly version: number;
  readonly symbol: string;
  readonly researchKind: "committee" | "department";
  readonly departmentId: string | null;
  readonly sourceLocale: "en" | "ko";
  readonly schemaVersion: "workflow-v2" | "workflow-v3";
  readonly publishedAt: string;
  readonly reportStatus:
    | "complete"
    | "complete_with_limitations"
    | "incomplete";
  readonly totalScore: number;
  readonly scoreComponents: QualityScoreComponents;
  readonly fatalReasons: readonly QualityFatalReason[];
  readonly runtimeDisposition: string;
  readonly groundedClaimRatio: number | null;
  readonly latencyMs: number | null;
  readonly modelCostUsd: number | null;
  readonly dataCostUsd: number | null;
  readonly observationOutcome: string | null;
  readonly observationReasonCodes: readonly string[] | null;
};

const scored: ScoredRun[] = [];
const failures: { readonly runId: string; readonly reason: string }[] = [];

for (const row of rows) {
  try {
    const artifactPath = path.join(
      dataRoot,
      "artifacts",
      "sha256",
      row.content_hash.slice(0, 2),
      row.content_hash.slice(2),
    );
    const bytes = await readFile(artifactPath);
    if (createHash("sha256").update(bytes).digest("hex") !== row.content_hash)
      throw new Error("ARTIFACT_DIGEST_MISMATCH");
    if (bytes.byteLength !== row.byte_length)
      throw new Error("ARTIFACT_BYTE_LENGTH_MISMATCH");

    const decoded: unknown = JSON.parse(bytes.toString("utf8"));
    const v3 = WorkflowV3ResearchReportSchema.safeParse(decoded);
    const report = v3.success
      ? v3.data
      : WorkflowV2ResearchReportSchema.parse(decoded);
    const sourceLocale = v3.success ? v3.data.sourceLocale : row.locale;

    const file = researchReportToFile(report, row.published_at);
    const quality = liveQuality(file, sourceLocale);

    const observation = readResearchQualityObservation(database, row.run_id);
    const fallbackLatencyMs =
      Date.parse(row.published_at) - Date.parse(row.run_created_at);

    scored.push({
      runId: row.run_id,
      reportId: row.report_id,
      versionId: row.version_id,
      version: row.version,
      symbol: row.symbol,
      researchKind: row.research_kind,
      departmentId: row.department_id,
      sourceLocale,
      schemaVersion: v3.success ? "workflow-v3" : "workflow-v2",
      publishedAt: row.published_at,
      reportStatus: row.status,
      totalScore: quality.totalScore,
      scoreComponents: quality.scoreComponents,
      fatalReasons: quality.fatalReasons,
      runtimeDisposition: quality.runtimeDisposition,
      groundedClaimRatio: observation?.metrics.groundedClaimRatio ?? null,
      latencyMs:
        observation?.metrics.latencyMs ??
        (Number.isFinite(fallbackLatencyMs) && fallbackLatencyMs >= 0
          ? fallbackLatencyMs
          : null),
      modelCostUsd: observation?.metrics.modelCostUsd ?? null,
      dataCostUsd: observation?.metrics.dataCostUsd ?? null,
      observationOutcome: observation?.outcome ?? null,
      observationReasonCodes: observation?.reasonCodes ?? null,
    });
  } catch (error) {
    failures.push({
      runId: row.run_id,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

database.close();

if (scored.length === 0)
  throw new Error("QUALITY_TIMESERIES_NO_REPORTS_SCORED");

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(
  values: readonly number[],
  fraction: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(fraction * sorted.length)),
  );
  return sorted[index] ?? null;
}

const DIMENSIONS = [
  "decisionUsefulness",
  "evidenceTraceability",
  "comparatorValuationDiscipline",
  "editorialClarity",
  "reliability",
] as const;

const scores = scored.map((run) => run.totalScore);
const groundedRatios = scored
  .map((run) => run.groundedClaimRatio)
  .filter((value): value is number => value !== null);
const outcomeCounts = scored.reduce<Record<string, number>>((counts, run) => {
  counts[run.reportStatus] = (counts[run.reportStatus] ?? 0) + 1;
  return counts;
}, {});
const meanScoreComponents = Object.fromEntries(
  DIMENSIONS.map((dimension) => [
    dimension,
    mean(scored.map((run) => run.scoreComponents[dimension])),
  ]),
) as Record<(typeof DIMENSIONS)[number], number | null>;

const sourceDbSnapshot = createHash("sha256")
  .update(await readFile(databasePath))
  .digest("hex");

const generatedAt = new Date().toISOString();
const archive = {
  date: generatedAt.slice(0, 10),
  generatedAt,
  sourceDbSnapshot: `sha256:${sourceDbSnapshot}`,
  runCount: scored.length,
  failedCount: failures.length,
  failures,
  runs: scored,
  aggregates: {
    runCount: scored.length,
    outcomeCounts,
    meanScore: mean(scores),
    p10Score: percentile(scores, 0.1),
    meanScoreComponents,
    groundedRatioSampleSize: groundedRatios.length,
    meanGroundedRatio: mean(groundedRatios),
  },
};

await mkdir(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, `${archive.date}.json`);
await writeFile(jsonPath, `${JSON.stringify(archive, null, 2)}\n`, "utf8");

const summaryLines = [
  `# Research quality timeseries — ${archive.date}`,
  "",
  `- Reports scored: ${archive.runCount} (failed to score: ${archive.failedCount})`,
  `- Source DB: ${maskedDatabasePath}`,
  `- Mean total score (of 10): ${archive.aggregates.meanScore?.toFixed(2) ?? "n/a"}`,
  `- P10 total score: ${archive.aggregates.p10Score?.toFixed(2) ?? "n/a"}`,
  `- Report status counts: ${JSON.stringify(archive.aggregates.outcomeCounts)}`,
  `- Grounded claim ratio (n=${archive.aggregates.groundedRatioSampleSize}): ${
    archive.aggregates.meanGroundedRatio?.toFixed(2) ?? "n/a"
  }`,
  "",
  "## Mean score by dimension (each max 2.0)",
  "",
  ...DIMENSIONS.map(
    (dimension) =>
      `- ${dimension}: ${meanScoreComponents[dimension]?.toFixed(2) ?? "n/a"}`,
  ),
];
if (failures.length > 0) {
  summaryLines.push("", "## Failed to score", "");
  for (const failure of failures)
    summaryLines.push(`- ${failure.runId}: ${failure.reason}`);
}
const summaryPath = path.join(outputDir, `${archive.date}-summary.md`);
await writeFile(summaryPath, `${summaryLines.join("\n")}\n`, "utf8");

console.log(
  `scored ${scored.length}/${rows.length} report_versions (${failures.length} failed) -> ${jsonPath}`,
);
