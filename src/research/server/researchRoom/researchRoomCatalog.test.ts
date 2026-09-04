import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isResearchRoomIndexable,
  listResearchRoomReportPage,
  listResearchRoomReports,
  listResearchRoomSitemapEntries,
} from "./researchRoomCatalog";

const roots: string[] = [];
const reportId = "10000000-0000-4000-8000-000000000001";
const runId = "10000000-0000-4000-8000-000000000002";
const snapshotId = "10000000-0000-4000-8000-000000000003";

type CatalogVersionFixture = {
  readonly version: number;
  readonly status: "complete" | "complete_with_limitations" | "incomplete";
  readonly publishedAt: string;
};

type CatalogReportFixture = {
  readonly reportId?: string;
  readonly versions: readonly CatalogVersionFixture[];
  readonly state?: "published" | "draft";
  readonly runStatus?: "completed" | "complete-with-limitations" | "running";
  readonly missingArtifactVersion?: number;
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    roots.splice(0).map(async (root) => await rm(root, { recursive: true })),
  );
});

async function catalogFixture(
  versions: readonly CatalogVersionFixture[],
): Promise<void> {
  await catalogFixtures([{ versions }]);
}

function fixtureId(prefix: string, ordinal: number): string {
  return `${prefix}-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
}

async function catalogFixtures(
  reports: readonly CatalogReportFixture[],
): Promise<void> {
  const dataRoot = await mkdtemp(join(tmpdir(), "stocksembly-research-room-"));
  roots.push(dataRoot);
  const database = new Database(join(dataRoot, "research.sqlite"));
  database.exec(`
    CREATE TABLE reports(report_id TEXT PRIMARY KEY, state TEXT NOT NULL);
    CREATE TABLE report_versions(
      report_id TEXT NOT NULL, run_id TEXT NOT NULL, snapshot_id TEXT NOT NULL,
      version_id TEXT NOT NULL, version INTEGER NOT NULL, artifact_id TEXT NOT NULL,
      status TEXT NOT NULL, published_at TEXT NOT NULL, public_payload_json TEXT NOT NULL
    );
    CREATE TABLE artifacts(artifact_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL);
    CREATE TABLE research_requests(
      run_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, question TEXT NOT NULL,
      locale TEXT NOT NULL, research_kind TEXT NOT NULL, department_id TEXT
    );
    CREATE TABLE runs(
      run_id TEXT PRIMARY KEY, last_event_seq INTEGER NOT NULL, created_at TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE research_room_views(
      report_id TEXT PRIMARY KEY, view_count INTEGER NOT NULL, last_viewed_at TEXT NOT NULL
    );
  `);
  const insertReport = database.prepare(
    "INSERT INTO reports(report_id, state) VALUES (?, ?)",
  );
  const insertArtifact = database.prepare(
    "INSERT INTO artifacts(artifact_id, content_hash) VALUES (?, ?)",
  );
  const insertVersion = database.prepare(`INSERT INTO report_versions(
    report_id, run_id, snapshot_id, version_id, version, artifact_id,
    status, published_at, public_payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')`);
  const insertRequest = database.prepare(`INSERT INTO research_requests(
    run_id, symbol, question, locale, research_kind, department_id
  ) VALUES (?, ?, 'Baseline visibility', 'en', 'committee', NULL)`);
  const insertRun = database.prepare(`INSERT INTO runs(
    run_id, last_event_seq, created_at, status
  ) VALUES (?, 0, '2026-08-01T00:00:00.000Z', ?)`);
  for (const [reportIndex, report] of reports.entries()) {
    const ordinal = reportIndex + 1;
    const fixtureReportId =
      report.reportId ??
      (reportIndex === 0 ? reportId : fixtureId("10000000", ordinal));
    const fixtureRunId =
      reportIndex === 0 ? runId : fixtureId("11000000", ordinal);
    const fixtureSnapshotId =
      reportIndex === 0 ? snapshotId : fixtureId("12000000", ordinal);
    insertReport.run(fixtureReportId, report.state ?? "published");
    for (const version of report.versions) {
      const versionOrdinal = ordinal * 100 + version.version;
      const versionId = fixtureId("13000000", versionOrdinal);
      const artifactId = fixtureId("20000000", versionOrdinal);
      if (version.version !== report.missingArtifactVersion)
        insertArtifact.run(artifactId, version.version.toString(16).repeat(64));
      insertVersion.run(
        fixtureReportId,
        fixtureRunId,
        fixtureSnapshotId,
        versionId,
        version.version,
        artifactId,
        version.status,
        version.publishedAt,
      );
    }
    insertRequest.run(fixtureRunId, `S${String(ordinal).padStart(3, "0")}`);
    insertRun.run(fixtureRunId, report.runStatus ?? "completed");
  }
  database.close();
  vi.stubEnv("STOCKSEMBLY_DATA_DIR", dataRoot);
}

describe("research room catalog access", () => {
  it("bounds an 81-row catalog page to the existing 80-row maximum", async () => {
    // Given
    await catalogFixtures(
      Array.from({ length: 81 }, () => ({
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
      })),
    );

    // When
    const page = await listResearchRoomReportPage(
      { authenticated: false, tier: "paid" },
      { limit: 81, now: new Date("2026-08-10T00:00:00.000Z") },
    );

    // Then
    expect(page.total).toBe(81);
    expect(page.reports).toHaveLength(80);
  });

  it("projects every eligible report for the sitemap without catalog pagination", async () => {
    // Given
    const selectedPublicationTime = "2026-08-03T00:00:00.000Z";
    const eligibleReportIds = Array.from({ length: 81 }, (_, index) =>
      fixtureId("10000000", index + 1),
    );
    const recoveredReportId = fixtureId("10000000", 82);
    await catalogFixtures([
      {
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-01T00:00:00.000Z",
          },
          {
            version: 2,
            status: "complete_with_limitations",
            publishedAt: selectedPublicationTime,
          },
        ],
      },
      ...Array.from(
        { length: 80 },
        (): CatalogReportFixture => ({
          versions: [
            {
              version: 1,
              status: "complete",
              publishedAt: "2026-08-01T00:00:00.000Z",
            },
          ],
        }),
      ),
      {
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-01T00:00:00.000Z",
          },
          {
            version: 2,
            status: "incomplete",
            publishedAt: "2026-08-09T00:00:00.000Z",
          },
        ],
      },
      {
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-03T00:00:00.001Z",
          },
        ],
      },
      {
        state: "draft",
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
      {
        runStatus: "running",
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
      {
        missingArtifactVersion: 1,
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
      {
        reportId: "invalid-report-id",
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
      {
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "not-a-date",
          },
        ],
      },
    ] satisfies readonly CatalogReportFixture[]);

    // When
    const entries = await listResearchRoomSitemapEntries(
      new Date("2026-08-10T00:00:00.000Z"),
    );

    // Then
    expect(entries).toHaveLength(82);
    expect(entries.map((entry) => entry.reportId)).toEqual([
      reportId,
      recoveredReportId,
      ...eligibleReportIds.slice(1).reverse(),
    ]);
    expect(entries[0]).toEqual({
      reportId,
      publishedAt: selectedPublicationTime,
    });
    expect(entries.map((entry) => entry.reportId)).not.toContain(
      "invalid-report-id",
    );
  });

  it("lists a completed report one millisecond before the free-access delay expires", async () => {
    // Given
    const now = new Date("2026-08-10T00:00:00.000Z");
    await catalogFixture([
      {
        version: 1,
        status: "complete",
        publishedAt: "2026-08-03T00:00:00.001Z",
      },
    ]);

    // When
    const reports = await listResearchRoomReports(
      { authenticated: false, tier: "free" },
      { now },
    );

    // Then
    expect(reports).toHaveLength(1);
    expect(reports[0]?.locked).toBe(true);
  });

  it("lets an authenticated free user unlock a recent report with credits", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    await catalogFixture([
      {
        version: 1,
        status: "complete",
        publishedAt: "2026-08-03T00:00:00.001Z",
      },
    ]);

    const reports = await listResearchRoomReports(
      { authenticated: true, tier: "free" },
      { now },
    );

    expect(reports).toHaveLength(1);
    expect(reports[0]?.locked).toBe(false);
  });

  it("makes report indexability inclusive at the seven-day boundary", () => {
    // Given
    const now = new Date("2026-08-10T00:00:00.000Z");

    // When
    const beforeDelay = isResearchRoomIndexable(
      "complete",
      "2026-08-03T00:00:00.001Z",
      now,
    );
    const atDelay = isResearchRoomIndexable(
      "complete",
      "2026-08-03T00:00:00.000Z",
      now,
    );
    const afterDelay = isResearchRoomIndexable(
      "complete_with_limitations",
      "2026-08-02T23:59:59.999Z",
      now,
    );
    const invalidPublicationDate = isResearchRoomIndexable(
      "complete",
      "not-a-date",
      now,
    );

    // Then
    expect(beforeDelay).toBe(false);
    expect(atDelay).toBe(true);
    expect(afterDelay).toBe(true);
    expect(invalidPublicationDate).toBe(false);
  });

  it("keeps the latest publishable report visible when a newer attempt is incomplete", async () => {
    // Given
    await catalogFixture([
      {
        version: 1,
        status: "complete",
        publishedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        version: 2,
        status: "incomplete",
        publishedAt: "2026-08-09T00:00:00.000Z",
      },
    ]);

    // When
    const reports = await listResearchRoomReports(
      { authenticated: false, tier: "free" },
      { now: new Date("2026-08-10T00:00:00.000Z") },
    );

    // Then
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      reportId,
      publishedAt: "2026-08-01T00:00:00.000Z",
      status: "complete",
    });
  });

  it("does not count a report without a stored artifact in company facets", async () => {
    // Given
    await catalogFixtures([
      {
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
      {
        missingArtifactVersion: 1,
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-02T00:00:00.000Z",
          },
        ],
      },
    ]);

    // When
    const page = await listResearchRoomReportPage(
      { authenticated: false, tier: "free" },
      { now: new Date("2026-08-10T00:00:00.000Z") },
    );

    // Then
    expect(page.total).toBe(1);
    expect(page.companies).toEqual([{ symbol: "S001", count: 1 }]);
  });

  it("rejects an invalid persisted published timestamp", async () => {
    // Given
    await catalogFixture([
      { version: 1, status: "complete", publishedAt: "not-a-date" },
    ]);

    // When
    const catalog = listResearchRoomReports(
      { authenticated: false, tier: "free" },
      { now: new Date("2026-08-10T00:00:00.000Z") },
    );

    // Then
    await expect(catalog).rejects.toThrow();
  });
});
