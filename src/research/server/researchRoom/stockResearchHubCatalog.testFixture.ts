import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { vi } from "vitest";

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
  const database = new Database(join(dataRoot, "research.sqlite"));
  database.exec(`
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
  const insertReport = database.prepare(
    "INSERT INTO reports(report_id, state) VALUES (?, 'published')",
  );
  const insertVersion = database.prepare(`INSERT INTO report_versions(
    report_id, run_id, version, artifact_id, status, published_at
  ) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertArtifact = database.prepare(
    "INSERT INTO artifacts(artifact_id) VALUES (?)",
  );
  const insertRequest = database.prepare(`INSERT INTO research_requests(
    run_id, symbol, question, locale, research_kind, department_id
  ) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertRun = database.prepare(
    "INSERT INTO runs(run_id, status) VALUES (?, 'completed')",
  );
  const insertSymbol = database.prepare(`INSERT OR IGNORE INTO symbol_registry(
    provider_code, user_ticker, name, status
  ) VALUES (?, ?, ?, 'active')`);

  for (const [reportIndex, report] of reports.entries()) {
    const ordinal = reportIndex + 1;
    const runId = stockHubFixtureId("21000000", ordinal);
    insertReport.run(report.reportId);
    insertRequest.run(
      runId,
      report.symbol,
      report.question,
      report.locale,
      report.researchKind,
      report.departmentId ?? null,
    );
    insertRun.run(runId);
    insertSymbol.run(`NASDAQ:${report.symbol}`, report.symbol, report.company);
    for (const version of report.versions) {
      const artifactId = stockHubFixtureId(
        "22000000",
        ordinal * 100 + version.version,
      );
      if (version.hasArtifact !== false) insertArtifact.run(artifactId);
      insertVersion.run(
        report.reportId,
        runId,
        version.version,
        artifactId,
        version.status,
        version.publishedAt,
      );
    }
  }
  database.close();
  vi.stubEnv("STOCKSEMBLY_DATA_DIR", dataRoot);
}
