import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import {
  evaluateEditorialQuality,
  extractNumericTokens,
} from "../src/research/domain/editorialQuality";
import { WorkflowV2ResearchReportSchema } from "../src/research/domain/report";

type LedgerEntry = {
  readonly surface: "committee" | "market" | "company" | "financial" | "risk";
  readonly symbol: string;
  readonly runId: string;
  readonly reportId: string;
};

const [ledgerArgument, outputArgument] = process.argv.slice(2);
if (ledgerArgument === undefined || outputArgument === undefined)
  throw new Error(
    "usage: audit-official-five-reports <ledger.json> <output-dir>",
  );

const ledgerPath = path.resolve(ledgerArgument);
const outputDir = path.resolve(outputArgument);
const dataRoot =
  process.env["STOCKSEMBLY_DATA_DIR"] ??
  path.join(
    process.env["HOME"] ?? "",
    "Library",
    "Application Support",
    "Stocksembly",
    "research",
  );
const database = new Database(path.join(dataRoot, "research.sqlite"), {
  readonly: true,
});
const ledger = JSON.parse(await readFile(ledgerPath, "utf8")) as {
  entries: LedgerEntry[];
};
if (ledger.entries.length !== 5)
  throw new Error("OFFICIAL_LEDGER_REQUIRES_FIVE_ENTRIES");

const results = [];
for (const entry of ledger.entries) {
  const row = database
    .prepare(`
    SELECT runs.status, runs.report_id, research_requests.symbol,
      research_requests.research_kind, research_requests.department_id,
      report_versions.version_id, artifacts.content_hash,
      artifacts.byte_length, report_versions.public_payload_json
    FROM runs
    JOIN research_requests ON research_requests.run_id = runs.run_id
    JOIN report_versions ON report_versions.run_id = runs.run_id
    JOIN artifacts ON artifacts.artifact_id = report_versions.artifact_id
    WHERE runs.run_id = ?
    ORDER BY report_versions.version DESC LIMIT 1
  `)
    .get(entry.runId) as Record<string, unknown> | undefined;
  if (row === undefined)
    throw new Error(`${entry.surface}:PUBLISHED_ROW_MISSING`);
  if (row.report_id !== entry.reportId)
    throw new Error(`${entry.surface}:REPORT_ID_MISMATCH`);
  if (!["complete", "complete-with-limitations"].includes(String(row.status)))
    throw new Error(
      `${entry.surface}:NONTERMINAL_STATUS:${String(row.status)}`,
    );
  const digest = String(row.content_hash);
  const artifactPath = path.join(
    dataRoot,
    "artifacts",
    "sha256",
    digest.slice(0, 2),
    digest.slice(2),
  );
  const bytes = await readFile(artifactPath);
  if (createHash("sha256").update(bytes).digest("hex") !== digest)
    throw new Error(`${entry.surface}:ARTIFACT_DIGEST_MISMATCH`);
  const report = WorkflowV2ResearchReportSchema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  const publicationPayload = JSON.parse(String(row.public_payload_json)) as {
    editorialPublication?: { candidate?: { supportedNumbers?: unknown } };
  };
  const persistedSupportedNumbers =
    publicationPayload.editorialPublication?.candidate?.supportedNumbers;
  const supportedNumbers =
    Array.isArray(persistedSupportedNumbers) &&
    persistedSupportedNumbers.every((value) => typeof value === "string")
      ? persistedSupportedNumbers
      : [
          ...new Set(
            report.editorialClaims.flatMap((claim) => [
              ...extractNumericTokens(claim.publicThesis.en),
              ...extractNumericTokens(claim.publicThesis.ko),
              ...extractNumericTokens(claim.falsifier.en),
              ...extractNumericTokens(claim.falsifier.ko),
            ]),
          ),
        ];
  const localeAudits = (["en", "ko"] as const).map((locale) => {
    const team = report.teamViews[0];
    if (team === undefined)
      throw new Error(`${entry.surface}:TEAM_VIEW_MISSING`);
    return {
      locale,
      ...evaluateEditorialQuality({
        locale,
        position: team.position[locale],
        rationale: team.rationale[locale],
        supportedNumbers,
        sections: report.locales[locale].sections.map((section) => ({
          sectionKey: section.id,
          claimIds: section.claimIds,
          text: section.body,
        })),
        comparators: report.comparators,
        anticipatedQuestions: report.anticipatedQuestions.map((question) => ({
          decisionKey: question.decisionKey,
          answer: question.answer[locale],
        })),
      }),
    };
  });
  const failedLocale = localeAudits.find((audit) => !audit.passed);
  if (failedLocale !== undefined)
    throw new Error(
      `${entry.surface}:EDITORIAL_GATE_FAILED:${failedLocale.reasons.join(",")}`,
    );
  if (report.editorialClaims.length < 3)
    throw new Error(`${entry.surface}:THREE_DRIVERS_REQUIRED`);
  if (
    report.editorialClaims.some(
      (claim) =>
        claim.evidenceArtifactIds.length === 0 ||
        claim.falsifier.en === claim.publicThesis.en,
    )
  )
    throw new Error(`${entry.surface}:CLAIM_OWNERSHIP_OR_LINEAGE_INVALID`);
  if (report.anticipatedQuestions.length < 5)
    throw new Error(`${entry.surface}:PERSISTED_QA_INSUFFICIENT`);
  results.push({
    ...entry,
    terminalStatus: row.status,
    versionId: row.version_id,
    artifactDigest: digest,
    artifactBytes: bytes.byteLength,
    schemaVersion: report.schemaVersion,
    claimCount: report.editorialClaims.length,
    roleOwners: [
      ...new Set(report.editorialClaims.map((claim) => claim.roleOwner)),
    ],
    dispositionCounts: report.claims.reduce<Record<string, number>>(
      (counts, claim) => {
        counts[claim.disposition] = (counts[claim.disposition] ?? 0) + 1;
        return counts;
      },
      {},
    ),
    comparatorCount: report.comparators.length,
    anticipatedQuestionCount: report.anticipatedQuestions.length,
    localeAudits,
  });
}

database.close();
await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, "official-content-audit.json"),
  `${JSON.stringify({ passed: true, reports: results }, null, 2)}\n`,
  "utf8",
);
