import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import {
  cleanupApiTestDatabases,
  createApiTestDatabase,
  currentApiTestDatabase,
} from "../api/postgresApi.testSupport";

const roots: string[] = [];

type VersionFixture = Readonly<{
  version: number;
  status: "complete" | "complete_with_limitations" | "incomplete";
  publishedAt: string;
  hasArtifact?: boolean;
}>;

export type StockHubReportFixture = Readonly<{
  reportId: string;
  symbol: string;
  company: string;
  question: string;
  locale: "en" | "ko";
  researchKind: "committee" | "department";
  departmentId?: "market" | "company" | "financial" | "risk";
  versions: readonly VersionFixture[];
}>;

export const STOCK_HUB_NOW = new Date("2026-08-10T00:00:00.000Z");

export function stockHubFixtureId(prefix: string, ordinal: number): string {
  return `${prefix}-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
}

export async function cleanupStockHubFixtures(): Promise<void> {
  await cleanupApiTestDatabases();
  vi.unstubAllEnvs();
  await Promise.all(
    roots.splice(0).map(async (root) => await rm(root, { recursive: true })),
  );
}

export async function createStockHubFixture(
  reports: readonly StockHubReportFixture[],
): Promise<void> {
  const dataRoot = await mkdtemp(join(tmpdir(), "stocksembly-stock-hub-"));
  roots.push(dataRoot);
  const database = await createApiTestDatabase();
  await database.query(`
    CREATE TABLE reports(report_id TEXT PRIMARY KEY, state TEXT NOT NULL);
    CREATE TABLE report_versions(
      report_id TEXT NOT NULL, run_id TEXT NOT NULL, version INTEGER NOT NULL,
      artifact_id TEXT NOT NULL, status TEXT NOT NULL, published_at TEXT NOT NULL
    );
    CREATE TABLE artifacts(artifact_id TEXT PRIMARY KEY);
    CREATE TABLE research_requests(
      run_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, question TEXT NOT NULL,
      locale TEXT NOT NULL, research_kind TEXT NOT NULL, department_id TEXT
    );
    CREATE TABLE runs(run_id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE symbol_registry(
      provider_code TEXT PRIMARY KEY, user_ticker TEXT NOT NULL,
      name TEXT NOT NULL, status TEXT NOT NULL
    );
  `);

  for (const [reportIndex, report] of reports.entries()) {
    const ordinal = reportIndex + 1;
    const runId = stockHubFixtureId("21000000", ordinal);
    await database.query(
      "INSERT INTO reports(report_id, state) VALUES ($1, 'published')",
      [report.reportId],
    );
    await database.query(
      `INSERT INTO research_requests(
    run_id, symbol, question, locale, research_kind, department_id
  ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        runId,
        report.symbol,
        report.question,
        report.locale,
        report.researchKind,
        report.departmentId ?? null,
      ],
    );
    await database.query(
      "INSERT INTO runs(run_id, status) VALUES ($1, 'completed')",
      [runId],
    );
    await database.query(
      `INSERT INTO symbol_registry(
    provider_code, user_ticker, name, status
  ) VALUES ($1, $2, $3, 'active') ON CONFLICT DO NOTHING`,
      [`NASDAQ:${report.symbol}`, report.symbol, report.company],
    );
    for (const version of report.versions) {
      const artifactId = stockHubFixtureId(
        "22000000",
        ordinal * 100 + version.version,
      );
      if (version.hasArtifact !== false)
        await database.query("INSERT INTO artifacts(artifact_id) VALUES ($1)", [
          artifactId,
        ]);
      await database.query(
        `INSERT INTO report_versions(
    report_id, run_id, version, artifact_id, status, published_at
  ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          report.reportId,
          runId,
          version.version,
          artifactId,
          version.status,
          version.publishedAt,
        ],
      );
    }
  }
  // Pool is cleaned up after the test.
  vi.stubEnv("STOCKSEMBLY_DATA_DIR", dataRoot);
}

vi.mock("../persistence/postgres/researchPool", () => ({
  getResearchPool: async () => currentApiTestDatabase(),
}));
