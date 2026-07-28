import { describe, expect, it } from "vitest";
import {
  type AcquisitionLedger,
  AgentArtifactSchema,
  appendEvidenceVersion,
  artifactContentHash,
  beginCollection,
  closeAcquisition,
  createAcquisitionLedger,
  createAgentArtifact,
  createEvidenceChain,
  createEvidenceRecord,
  createNormalizedArtifact,
  createRawArtifact,
  createReportArtifact,
  EvidenceRecordSchema,
  evidenceRecordHashFor,
  hashBytes,
  hashCanonical,
  linkArtifact,
  NormalizedArtifactSchema,
  RawArtifactSchema,
  ReportArtifactSchema,
  recordRetrievedEvidence,
  reconcileLicensedProviderValue,
  sealMandate,
  sealSnapshot,
} from "./evidence";

const RUN_ID = "00000000-0000-4000-8000-000000000001";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000002";
const LATER = "2026-07-22T01:00:00.000Z";

const filingLocator = {
  kind: "sec_filing" as const,
  source: "sec_company_facts" as const,
  sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json",
  accession: "0000000001-26-000001",
  form: "10-Q",
  filedAt: "2026-07-20T12:00:00.000Z",
  acceptedAt: "2026-07-20T12:01:00.000Z",
  periodStart: "2026-04-01",
  periodEnd: "2026-06-30",
  unit: "USD",
};

function ledger(): AcquisitionLedger {
  return createAcquisitionLedger({
    runId: RUN_ID,
    snapshotId: SNAPSHOT_ID,
    requestedAt: "2026-07-22T00:00:00.000Z",
  });
}

describe("immutable evidence and point-in-time contracts", () => {
  it.each([
    ["period", { period: "FY:2024-12-31", unit: "USD", currency: "USD" }],
    ["unit", { period: "FY:2025-12-31", unit: "thousands", currency: "USD" }],
    ["currency", { period: "FY:2025-12-31", unit: "USD", currency: "EUR" }],
  ] as const)(
    "keeps the SEC value authoritative and discloses provider %s mismatch",
    (dimension, providerCoordinates) => {
      const result = reconcileLicensedProviderValue({
        metric: "revenue_annual",
        sec: {
          value: "100",
          period: "FY:2025-12-31",
          unit: "USD",
          currency: "USD",
        },
        provider: { value: "101", ...providerCoordinates },
      });

      expect(result.authoritative).toEqual({
        source: "sec_company_facts",
        value: "100",
      });
      expect(result.disagreements).toContain(`${dimension}_mismatch`);
      expect(result.limitations).toContain(
        `insightsentry_sec_${dimension}_mismatch`,
      );
    },
  );

  it("records acquisition, closes before cutoff, seals snapshot, then seals mandate", () => {
    const started = beginCollection(ledger(), "2026-07-22T00:01:00.000Z");
    const raw = {
      artifactId: "raw-1",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:02:00.000Z",
      statusCode: 200,
      body: '{"facts":{}}',
      locator: filingLocator,
    };
    const withEvidence = recordRetrievedEvidence(started, raw);
    const closed = closeAcquisition(withEvidence, {
      evidenceCutoffAt: "2026-07-22T00:03:00.000Z",
      acquisitionClosedAt: "2026-07-22T00:02:30.000Z",
    });
    const snapshot = sealSnapshot(closed, "2026-07-22T00:04:00.000Z");
    const mandate = sealMandate(snapshot, "2026-07-22T00:05:00.000Z");

    expect(mandate.state).toBe("mandate_sealed");
    expect(mandate.evidenceCutoffAt).toBe("2026-07-22T00:03:00.000Z");
    expect(mandate.snapshotSealedAt).toBe("2026-07-22T00:04:00.000Z");
    expect(mandate.mandateSealedAt).toBe("2026-07-22T00:05:00.000Z");
    expect(mandate.acquisitionClosedAt).toBe("2026-07-22T00:02:30.000Z");
  });

  it("does not treat requestedAt as the cutoff and rejects retrieval after cutoff", () => {
    expect(() =>
      closeAcquisition(beginCollection(ledger(), LATER), {
        evidenceCutoffAt: "2026-07-22T00:00:00.000Z",
      }),
    ).toThrow(/requestedAt|collection/i);

    const started = beginCollection(ledger(), "2026-07-22T00:01:00.000Z");
    const postCutoff = {
      artifactId: "bls-post-cutoff",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:04:00.000Z",
      statusCode: 200,
      body: "series,value",
      locator: {
        kind: "macro" as const,
        source: "bls_allowlist" as const,
        sourceUrl: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
        seriesId: "CUUR0000SA0" as const,
        period: "M06",
        unit: "index",
      },
    };
    expect(() =>
      closeAcquisition(recordRetrievedEvidence(started, postCutoff), {
        evidenceCutoffAt: "2026-07-22T00:03:00.000Z",
      }),
    ).toThrow(/cutoff/i);
    expect(() =>
      closeAcquisition(beginCollection(ledger(), "2026-07-22T00:01:00.000Z"), {
        evidenceCutoffAt: "2026-07-22T00:00:00.000Z",
      }),
    ).toThrow(/collection|cutoff/i);
    expect(() =>
      closeAcquisition(beginCollection(ledger(), "2026-07-22T00:01:00.000Z"), {
        evidenceCutoffAt: "2026-07-22T00:00:00.000Z",
        acquisitionClosedAt: "2026-07-22T00:00:00.000Z",
      }),
    ).toThrow(/request|cutoff/i);
  });

  it("rejects mandate-before-snapshot and 200 empty bodies into quarantine", () => {
    const closed = closeAcquisition(
      beginCollection(ledger(), "2026-07-22T00:01:00.000Z"),
      {
        evidenceCutoffAt: "2026-07-22T00:02:00.000Z",
        acquisitionClosedAt: "2026-07-22T00:01:30.000Z",
      },
    );
    expect(() => sealMandate(closed, "2026-07-22T00:03:00.000Z")).toThrow(
      /snapshot/i,
    );
    expect(() =>
      createRawArtifact({
        artifactId: "empty-200",
        runId: RUN_ID,
        snapshotId: SNAPSHOT_ID,
        retrievedAt: "2026-07-22T00:01:00.000Z",
        statusCode: 200,
        body: "",
        locator: filingLocator,
      }),
    ).toThrow(/quarantine|empty|semantic/i);
  });

  it("preserves original and amended filing versions without overwrite", () => {
    const original = createEvidenceRecord({
      evidenceId: "evidence-original",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:01:00.000Z",
      locator: {
        ...filingLocator,
        accession: "0000000001-26-000001",
        form: "10-Q",
      },
      revisionKind: "original",
      payloadHash: hashCanonical({ body: "one" }),
    });
    const chain = createEvidenceChain(original, {
      evidenceCutoffAt: "2026-07-22T00:03:00.000Z",
      snapshotSealedAt: "2026-07-22T00:04:00.000Z",
    });
    const amended = appendEvidenceVersion(chain, {
      evidenceId: "evidence-amended",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:02:00.000Z",
      locator: {
        ...filingLocator,
        accession: "0000000001-26-000002",
        form: "10-Q/A",
      },
      revisionKind: "amendment",
      payloadHash: hashCanonical({ body: "two" }),
      evidenceCutoffAt: "2026-07-22T00:03:00.000Z",
    });

    expect(amended.versions).toHaveLength(2);
    expect(amended.versions.map((version) => version.revisionKind)).toEqual([
      "original",
      "amendment",
    ]);
    const amendment = amended.versions[1];
    if (amendment === undefined) throw new Error("amendment fixture missing");
    expect(() => appendEvidenceVersion(amended, amendment)).toThrow(
      /overwrite|duplicate|immutable/i,
    );
    expect(() =>
      appendEvidenceVersion(chain, {
        evidenceId: "evidence-future-amendment",
        runId: RUN_ID,
        snapshotId: SNAPSHOT_ID,
        retrievedAt: "2026-07-22T00:04:00.000Z",
        locator: {
          ...filingLocator,
          accession: "0000000001-26-000003",
          form: "10-Q/A",
        },
        revisionKind: "amendment",
        payloadHash: hashCanonical({ body: "future" }),
      }),
    ).toThrow(/cutoff/i);
    expect(() =>
      appendEvidenceVersion(original, {
        evidenceId: "evidence-future-without-cutoff",
        runId: RUN_ID,
        snapshotId: SNAPSHOT_ID,
        retrievedAt: "2026-07-22T00:03:00.000Z",
        locator: {
          ...filingLocator,
          accession: "0000000001-26-000004",
          form: "10-Q/A",
        },
        revisionKind: "amendment",
        payloadHash: hashCanonical({ body: "future-without-cutoff" }),
      }),
    ).toThrow(/cutoff|context|sealed/i);
    expect(() =>
      appendEvidenceVersion(
        { ...chain, evidenceCutoffAt: "2026-07-22T00:10:00.000Z" },
        {
          evidenceId: "evidence-forged-context",
          runId: RUN_ID,
          snapshotId: SNAPSHOT_ID,
          retrievedAt: "2026-07-22T00:05:00.000Z",
          locator: {
            ...filingLocator,
            accession: "0000000001-26-000005",
            form: "10-Q/A",
          },
          revisionKind: "amendment",
          payloadHash: hashCanonical({ body: "forged-context" }),
        },
      ),
    ).toThrow(/context|sealed|cutoff/i);
  });

  it("uses deterministic canonical hashes and same-snapshot content-addressed edges", () => {
    expect(hashCanonical({ z: 1, a: [2, 3] })).toBe(
      hashCanonical({ a: [2, 3], z: 1 }),
    );
    expect(() =>
      linkArtifact({
        childRunId: RUN_ID,
        childSnapshotId: SNAPSHOT_ID,
        childHash: "a".repeat(64),
        parentRunId: RUN_ID,
        parentSnapshotId: "00000000-0000-4000-8000-000000000099",
        parentHash: "b".repeat(64),
      }),
    ).toThrow(/snapshot|lineage/i);
  });

  it("requires a typed locator and marks an unknown release time unavailable", () => {
    const valid = createEvidenceRecord({
      evidenceId: "evidence-locator-valid",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:01:00.000Z",
      locator: {
        kind: "macro",
        source: "bls_allowlist",
        sourceUrl: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
        seriesId: "LNS14000000",
        period: "M06",
        unit: "percent",
      },
      revisionKind: "original",
      payloadHash: hashCanonical({ body: "date,value" }),
    });
    expect(EvidenceRecordSchema.parse(valid).locator).toEqual(valid.locator);
    expect(valid.releaseTimeAvailability).toBe("unavailable");
    expect(() =>
      EvidenceRecordSchema.parse({
        ...valid,
        locator: { ...valid.locator, seriesId: "NOT_ALLOWLISTED" },
      }),
    ).toThrow();
  });

  it("requires a recorded close strictly before cutoff and a mandate strictly after snapshot", () => {
    const started = beginCollection(ledger(), "2026-07-22T00:01:00.000Z");
    expect(() =>
      closeAcquisition(started, {
        evidenceCutoffAt: "2026-07-22T00:03:00.000Z",
      }),
    ).toThrow(/close|recorded|cutoff/i);
    expect(() =>
      closeAcquisition(started, {
        evidenceCutoffAt: "2026-07-22T00:03:00.000Z",
        acquisitionClosedAt: "2026-07-22T00:03:00.000Z",
      }),
    ).toThrow(/before|cutoff/i);
    const closed = closeAcquisition(started, {
      evidenceCutoffAt: "2026-07-22T00:03:00.000Z",
      acquisitionClosedAt: "2026-07-22T00:02:30.000Z",
    });
    const snapshot = sealSnapshot(closed, "2026-07-22T00:04:00.000Z");
    expect(() => sealMandate(snapshot, "2026-07-22T00:04:00.000Z")).toThrow(
      /after|order|mandate/i,
    );
  });

  it("validates every exported derived artifact hash and preserves envelope key ordering", () => {
    const base = {
      artifactId: "normalized-1",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      createdAt: "2026-07-22T00:04:00.000Z",
      content: "normalized facts",
      sourceHashes: ["a".repeat(64)],
      parserVersion: "parser-1",
      parentHashes: ["b".repeat(64)],
    };
    const normalized = createNormalizedArtifact(base);
    expect(NormalizedArtifactSchema.parse(normalized)).toEqual(normalized);
    expect(
      createNormalizedArtifact({
        ...base,
        parentHashes: ["b".repeat(64)],
      }).contentHash,
    ).toBe(normalized.contentHash);
    expect(() =>
      NormalizedArtifactSchema.parse({ ...normalized, content: "tampered" }),
    ).toThrow(/hash/i);

    const agent = createAgentArtifact({
      artifactId: "agent-1",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      createdAt: "2026-07-22T00:05:00.000Z",
      role: "analyst",
      content: "agent output",
      inputManifestHash: "c".repeat(64),
      schemaVersion: "1",
      parentHashes: ["b".repeat(64)],
    });
    expect(() =>
      AgentArtifactSchema.parse({
        ...agent,
        inputManifestHash: "d".repeat(64),
      }),
    ).toThrow(/hash/i);

    const report = createReportArtifact({
      artifactId: "report-1",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      createdAt: "2026-07-22T00:06:00.000Z",
      content: "report output",
      inputManifestHash: "c".repeat(64),
      schemaVersion: "1",
      parentHashes: ["b".repeat(64)],
    });
    expect(() =>
      ReportArtifactSchema.parse({ ...report, parentHashes: [] }),
    ).toThrow(/hash|parent/i);
  });

  it("derives trusted raw artifacts from untrusted HTTP input instead of caller hashes or status", () => {
    const started = beginCollection(ledger(), "2026-07-22T00:01:00.000Z");
    const raw = createRawArtifact({
      artifactId: "raw-trust-boundary",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:01:30.000Z",
      statusCode: 200,
      body: '{"facts":{}}',
      locator: filingLocator,
    });
    expect(raw.bodyHash).toBe(hashBytes('{"facts":{}}'));
    expect(() =>
      recordRetrievedEvidence(started, {
        ...JSON.parse(JSON.stringify(raw)),
        body: '{"facts":{"tampered":true}}',
      }),
    ).toThrow(/hash|untrusted|body/i);
    expect(() =>
      recordRetrievedEvidence(started, {
        ...JSON.parse(JSON.stringify(raw)),
        semanticStatus: "accepted",
        bodyHash: "0".repeat(64),
        contentHash: "0".repeat(64),
      }),
    ).toThrow(/hash|untrusted|trusted|field/i);
    expect(() =>
      recordRetrievedEvidence(started, {
        ...JSON.parse(JSON.stringify(raw)),
        body: "   \n\t",
      }),
    ).toThrow(/empty|semantic|body/i);
  });

  it("rejects strict calendar-invalid timestamps in evidence locators", () => {
    expect(() =>
      createRawArtifact({
        artifactId: "invalid-calendar",
        runId: RUN_ID,
        snapshotId: SNAPSHOT_ID,
        retrievedAt: "2026-07-22T00:01:00.000Z",
        statusCode: 200,
        body: "filing",
        locator: {
          ...filingLocator,
          filedAt: "2026-02-30T00:00:00.000Z",
        },
      }),
    ).toThrow(/timestamp|date/i);
    expect(() =>
      createRawArtifact({
        artifactId: "invalid-offset",
        runId: RUN_ID,
        snapshotId: SNAPSHOT_ID,
        retrievedAt: "2026-07-22T00:01:00.0000+24:00",
        statusCode: 200,
        body: "filing",
        locator: filingLocator,
      }),
    ).toThrow(/timestamp|date|offset/i);
  });

  it("binds every EvidenceRecord field into recordHash for schema and append integrity", () => {
    const original = createEvidenceRecord({
      evidenceId: "hash-bound-original",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:01:00.000Z",
      locator: filingLocator,
      revisionKind: "original",
      payloadHash: hashCanonical({ body: "original" }),
      dataset: "sec_company_facts",
    });
    const chain = createEvidenceChain(original, {
      evidenceCutoffAt: "2026-07-22T00:03:00.000Z",
      snapshotSealedAt: "2026-07-22T00:04:00.000Z",
    });
    const amendment = createEvidenceRecord({
      evidenceId: "hash-bound-amendment",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:02:00.000Z",
      locator: {
        ...filingLocator,
        accession: "0000000001-26-000002",
        form: "10-Q/A",
      },
      revisionKind: "amendment",
      amendsEvidenceId: original.evidenceId,
      payloadHash: hashCanonical({ body: "amendment" }),
      dataset: "sec_company_facts",
    });
    const tampered = {
      ...amendment,
      dataset: "sec_filing" as const,
      recordHash: amendment.recordHash,
    };
    expect(() => EvidenceRecordSchema.parse(tampered)).toThrow(
      /hash|integrity/i,
    );
    expect(() => appendEvidenceVersion(chain, tampered)).toThrow(
      /hash|integrity/i,
    );
  });

  it("rejects an original whose retrieval or SEC filing availability is after the sealed cutoff", () => {
    const futureRetrieved = createEvidenceRecord({
      evidenceId: "future-retrieved-original",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:04:00.000Z",
      locator: filingLocator,
      revisionKind: "original",
      payloadHash: hashCanonical({ body: "future-retrieved" }),
    });
    expect(() =>
      createEvidenceChain(futureRetrieved, {
        evidenceCutoffAt: "2026-07-22T00:03:00.000Z",
        snapshotSealedAt: "2026-07-22T00:04:00.000Z",
      }),
    ).toThrow(/cutoff|available|original/i);
    const futureFiled = createEvidenceRecord({
      evidenceId: "future-filed-original",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:02:00.000Z",
      locator: {
        ...filingLocator,
        filedAt: "2026-07-22T00:04:00.000Z",
        acceptedAt: "2026-07-22T00:04:30.000Z",
      },
      revisionKind: "original",
      payloadHash: hashCanonical({ body: "future-filed" }),
    });
    expect(() =>
      createEvidenceChain(futureFiled, {
        evidenceCutoffAt: "2026-07-22T00:03:00.000Z",
        snapshotSealedAt: "2026-07-22T00:04:00.000Z",
      }),
    ).toThrow(/cutoff|filed|available/i);
  });

  it("allows exactly one original version and requires all appends to be amendments", () => {
    const original = createEvidenceRecord({
      evidenceId: "single-original",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:01:00.000Z",
      locator: filingLocator,
      revisionKind: "original",
      payloadHash: hashCanonical({ body: "single-original" }),
    });
    const chain = createEvidenceChain(original, {
      evidenceCutoffAt: "2026-07-22T00:03:00.000Z",
      snapshotSealedAt: "2026-07-22T00:04:00.000Z",
    });
    const amendmentAsInitial = createEvidenceRecord({
      evidenceId: "amendment-as-initial",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:02:00.000Z",
      locator: filingLocator,
      revisionKind: "amendment",
      amendsEvidenceId: original.evidenceId,
      payloadHash: hashCanonical({ body: "amendment-as-initial" }),
    });
    expect(() =>
      createEvidenceChain(amendmentAsInitial, {
        evidenceCutoffAt: "2026-07-22T00:03:00.000Z",
        snapshotSealedAt: "2026-07-22T00:04:00.000Z",
      }),
    ).toThrow(/original|revision/i);
    expect(() =>
      appendEvidenceVersion(chain, {
        evidenceId: "second-original",
        runId: RUN_ID,
        snapshotId: SNAPSHOT_ID,
        retrievedAt: "2026-07-22T00:02:00.000Z",
        locator: {
          ...filingLocator,
          accession: "0000000001-26-000006",
        },
        revisionKind: "original",
        payloadHash: hashCanonical({ body: "second-original" }),
      }),
    ).toThrow(/original|amendment|revision/i);
  });

  it("keeps known release availability equivalent to sourcePublishedAt in raw and evidence schemas", () => {
    const unknownRaw = createRawArtifact({
      artifactId: "release-unknown-raw",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:01:00.000Z",
      statusCode: 200,
      body: "unknown release",
      locator: filingLocator,
    });
    expect(() =>
      RawArtifactSchema.parse({
        ...unknownRaw,
        releaseTimeAvailability: "known",
        contentHash: artifactContentHash({
          ...unknownRaw,
          releaseTimeAvailability: "known",
          contentHash: "0".repeat(64),
        }),
      }),
    ).toThrow(/release|published/i);
    const knownEvidence = createEvidenceRecord({
      evidenceId: "release-known-evidence",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:01:00.000Z",
      sourcePublishedAt: "2026-07-22T00:00:30.000Z",
      locator: filingLocator,
      revisionKind: "original",
      payloadHash: hashCanonical({ body: "known release" }),
    });
    const { sourcePublishedAt: _knownAt, ...withoutKnownAt } = knownEvidence;
    expect(() =>
      EvidenceRecordSchema.parse({
        ...withoutKnownAt,
        releaseTimeAvailability: "known",
        recordHash: evidenceRecordHashFor({
          ...withoutKnownAt,
          releaseTimeAvailability: "known",
          recordHash: "0".repeat(64),
        }),
      }),
    ).toThrow(/release|published/i);
    const unknownEvidence = createEvidenceRecord({
      evidenceId: "release-unknown-evidence",
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      retrievedAt: "2026-07-22T00:01:00.000Z",
      locator: filingLocator,
      revisionKind: "original",
      payloadHash: hashCanonical({ body: "unknown release" }),
    });
    expect(() =>
      EvidenceRecordSchema.parse({
        ...unknownEvidence,
        sourcePublishedAt: "2026-07-22T00:00:30.000Z",
        releaseTimeAvailability: "unavailable",
        recordHash: evidenceRecordHashFor({
          ...unknownEvidence,
          sourcePublishedAt: "2026-07-22T00:00:30.000Z",
          releaseTimeAvailability: "unavailable",
          recordHash: "0".repeat(64),
        }),
      }),
    ).toThrow(/release|published/i);
  });
});
