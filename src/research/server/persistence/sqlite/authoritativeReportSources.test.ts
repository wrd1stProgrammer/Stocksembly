import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { hashBytes } from "../../../domain/contractHelpers";
import {
  ArtifactIdSchema,
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import type { TrustedCitationLocator } from "../../../ports/agentOutputCommit";
import { StrictArtifactCasFake } from "../../../ports/test/serviceFakes";
import { loadAuthenticatedReportSources } from "./authoritativeReportSources";
import { openSqliteStore } from "./sqliteStore";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => await rm(root, { recursive: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "report-sources-"));
  roots.push(root);
  const databasePath = join(root, "research.sqlite");
  const runId = RunIdSchema.parse(randomUUID());
  const snapshotId = SnapshotIdSchema.parse(randomUUID());
  const store = openSqliteStore(databasePath);
  store.createRun({
    runId,
    snapshotId,
    requestedAt: "2026-07-24T00:00:00.000Z",
    initialJob: {
      jobId: JobIdSchema.parse(randomUUID()),
      kind: "research",
      logicalKey: "collection:initial",
      inputHash: "a".repeat(64),
      createdAt: "2026-07-24T00:00:00.000Z",
    },
    initialEvent: {
      eventId: EventIdSchema.parse(randomUUID()),
      type: "run_queued",
      stateId: "queued",
      occurredAt: "2026-07-24T00:00:00.000Z",
    },
  });
  const cas = new StrictArtifactCasFake();
  return { databasePath, runId, snapshotId, store, cas };
}

async function seedSource(
  prepared: Awaited<ReturnType<typeof fixture>>,
  input: {
    readonly logicalKey: string;
    readonly bytes: Uint8Array;
    readonly locator: TrustedCitationLocator;
  },
) {
  const artifactId = ArtifactIdSchema.parse(randomUUID());
  const descriptor = await prepared.cas.put({
    artifactId,
    runId: prepared.runId,
    snapshotId: prepared.snapshotId,
    mediaType: "application/json",
    parentDigests: [],
    bytes: input.bytes,
  });
  prepared.store.saveArtifactMetadata({
    ...descriptor,
    contentHash: descriptor.digest,
    logicalKey: input.logicalKey,
    inputHash: descriptor.digest,
    createdAt: "2026-07-24T00:00:01.000Z",
    locator: input.locator,
  });
  return artifactId;
}

describe("loadAuthenticatedReportSources", () => {
  it("publishes authenticated NVDA provider coverage and captured-web identity", async () => {
    // Given
    const prepared = await fixture();
    const providerText = JSON.stringify({
      coverage: [
        {
          observedStart: "2026-06-01T13:30:00.000Z",
          observedEnd: "2026-07-22T20:00:00.000Z",
          barCount: 780,
        },
      ],
      limitations: ["provider_dataset_not_point_in_time_safe"],
    });
    const providerId = await seedSource(prepared, {
      logicalKey: "evidence:insightsentry:technical",
      bytes: new TextEncoder().encode(providerText),
      locator: {
        kind: "licensed_provider",
        source: "insightsentry_rapidapi",
        sourceUrl: "https://insightsentry.com/docs",
        endpoint: "/v3/symbols/{symbol}/series",
        symbol: "NASDAQ:NVDA",
        dataset: "market_bars",
        unit: "USD",
      },
    });
    const webText = "NVIDIA filed an official current report.";
    const webId = await seedSource(prepared, {
      logicalKey: `web:${randomUUID()}:${randomUUID()}`,
      bytes: new TextEncoder().encode(webText),
      locator: {
        kind: "captured_web",
        source: "captured_web",
        sourceUrl: "https://www.sec.gov/example",
        title: "Official current report",
        publisher: "U.S. Securities and Exchange Commission",
      },
    });
    prepared.store.close();
    const database = new Database(prepared.databasePath, { readonly: true });

    // When
    const sources = await loadAuthenticatedReportSources(
      database,
      prepared.cas,
      prepared.runId,
      new Set([providerId, webId]),
      [
        {
          artifactId: providerId,
          evidenceId: "insightsentry:technical",
          exactText: providerText,
          source: "insightsentry_rapidapi",
          retrievedAt: "2026-07-24T00:00:01.000Z",
          availableAt: "2026-07-24T00:00:01.000Z",
        },
        {
          artifactId: webId,
          evidenceId: "web:official-current-report",
          exactText: webText,
          source: "captured_web",
          retrievedAt: "2026-07-24T00:00:01.000Z",
          availableAt: "2026-07-24T00:00:01.000Z",
        },
      ],
    );
    database.close();

    // Then
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: providerId,
          sourceClass: "insightsentry_rapidapi",
          dataset: "market_bars",
          providerStatus: "available",
          observedPeriod: expect.objectContaining({
            observationCount: 780,
          }),
        }),
        expect.objectContaining({
          sourceId: webId,
          sourceClass: "captured_web",
          publisher: "U.S. Securities and Exchange Commission",
          url: "https://www.sec.gov/example",
        }),
      ]),
    );
  });

  it("publishes an authenticated 403 ledger as an unavailable provider limitation", async () => {
    // Given
    const prepared = await fixture();
    const ledgerText = JSON.stringify({
      runId: prepared.runId,
      uniqueUpstreamCalls: 1,
      entries: [],
      familyStates: {
        technical: {
          status: "unavailable",
          limitation: "subscription_required",
        },
        options: {
          status: "withheld",
          limitation: "rollout_disabled",
        },
      },
    });
    const ledgerId = await seedSource(prepared, {
      logicalKey: "evidence:insightsentry:request-ledger",
      bytes: new TextEncoder().encode(ledgerText),
      locator: {
        kind: "licensed_provider",
        source: "insightsentry_rapidapi",
        sourceUrl: "https://insightsentry.com/docs",
        endpoint: "request_ledger",
        symbol: "NASDAQ:NVDA",
        dataset: "insightsentry_request_ledger",
        unit: "unique upstream calls",
      },
    });
    expect(hashBytes(ledgerText)).toMatch(/^[a-f0-9]{64}$/u);
    prepared.store.close();
    const database = new Database(prepared.databasePath, { readonly: true });

    // When
    const sources = await loadAuthenticatedReportSources(
      database,
      prepared.cas,
      prepared.runId,
      new Set([ledgerId]),
      [],
    );
    database.close();

    // Then
    expect(sources).toEqual([
      expect.objectContaining({
        sourceId: ledgerId,
        dataset: "insightsentry_request_ledger",
        providerStatus: "unavailable",
        limitations: ["subscription_required", "rollout_disabled"],
      }),
    ]);
  });

  it("authenticates reused content by the requested run row instead of another digest descriptor", async () => {
    // Given
    const prepared = await fixture();
    const providerText = JSON.stringify({
      observedAt: "2026-07-24T00:00:00.000Z",
    });
    const providerBytes = new TextEncoder().encode(providerText);
    await prepared.cas.put({
      artifactId: ArtifactIdSchema.parse(randomUUID()),
      runId: RunIdSchema.parse(randomUUID()),
      snapshotId: SnapshotIdSchema.parse(randomUUID()),
      mediaType: "application/json",
      parentDigests: [],
      bytes: providerBytes,
    });
    const providerId = await seedSource(prepared, {
      logicalKey: "evidence:insightsentry:quote",
      bytes: providerBytes,
      locator: {
        kind: "licensed_provider",
        source: "insightsentry_rapidapi",
        sourceUrl: "https://insightsentry.com/docs",
        endpoint: "/v3/symbols/{symbol}/quote",
        symbol: "NASDAQ:NVDA",
        dataset: "insightsentry_quote",
        unit: "USD",
      },
    });
    prepared.store.close();
    const database = new Database(prepared.databasePath, { readonly: true });

    // When
    const sources = await loadAuthenticatedReportSources(
      database,
      prepared.cas,
      prepared.runId,
      new Set([providerId]),
      [
        {
          artifactId: providerId,
          evidenceId: "insightsentry:quote",
          exactText: providerText,
          source: "insightsentry_rapidapi",
          retrievedAt: "2026-07-24T00:00:01.000Z",
          availableAt: "2026-07-24T00:00:00.000Z",
        },
      ],
    );
    database.close();

    // Then
    expect(sources).toEqual([
      expect.objectContaining({
        sourceId: providerId,
        dataset: "insightsentry_quote",
        providerStatus: "available",
      }),
    ]);
  });
});
