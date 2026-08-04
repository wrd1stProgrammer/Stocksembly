import { describe, expect, it } from "vitest";
import { qualifyComparatorsBeforeSynthesis } from "./preSynthesisComparatorQualification";
import { permittedSpecialistInlineArtifact } from "./specialistRoundSqliteStage";
import { isSpecialistAttemptReadableSource } from "./specialistRoundSqliteHandler";

const peerEvidence = {
  providerUpdatedAt: "2026-07-30T00:00:00.000Z",
  sector: "Technology",
  subject: {
    symbol: "NASDAQ:SUBJECT",
    name: "Subject",
    sector: "Technology",
    primaryProductMarket: "accelerated computing",
    primaryCustomerMarket: "data centers",
    priceEarningsTtm: 40,
    operatingMarginTtm: 25,
  },
  peers: [20, 30, 25].map((priceEarningsTtm, index) => ({
    symbol: `NASDAQ:PEER${index + 1}`,
    name: `Peer ${index + 1}`,
    sector: "Technology",
    primaryProductMarket: "accelerated computing",
    primaryCustomerMarket: "data centers",
    classification: "direct_competitor",
    selectionReasons: ["same product and customer market"],
    priceEarningsTtm,
    operatingMarginTtm: 18,
  })),
};

describe("pre-synthesis comparator qualification", () => {
  it("keeps raw peer artifacts auditable but out of specialist inline evidence", () => {
    // Given
    const artifacts = [
      { dataset: "insightsentry_peers" },
      { dataset: "sec_filing" },
    ];

    // When
    const permitted = artifacts.filter(permittedSpecialistInlineArtifact);

    // Then
    expect(permitted).toEqual([{ dataset: "sec_filing" }]);
  });

  it("keeps the raw peer source ID on the job but out of attempt-readable files", () => {
    // Given
    const prepared = qualifyComparatorsBeforeSynthesis([
      {
        evidenceId: "insightsentry:peers",
        artifactId: "peer-artifact",
        bytes: new TextEncoder().encode(JSON.stringify(peerEvidence)),
      },
    ]);
    const sourceArtifactIds = ["peer-artifact", "filing-artifact"];

    // When
    const readable = sourceArtifactIds.filter((artifactId) =>
      isSpecialistAttemptReadableSource(
        { comparatorQualification: prepared },
        artifactId,
      ),
    );

    // Then
    expect(sourceArtifactIds).toContain("peer-artifact");
    expect(readable).toEqual(["filing-artifact"]);
    expect(prepared).toMatchObject({
      status: "available",
      qualification: { rows: expect.any(Array) },
    });
  });

  it("qualifies sealed peer bytes once before specialist synthesis", () => {
    // Given
    const bytes = new TextEncoder().encode(JSON.stringify(peerEvidence));
    const sources = [
      {
        evidenceId: "insightsentry:peers",
        artifactId: "peer-artifact",
        bytes,
      },
    ];
    const before = JSON.stringify(sources.map((source) => [...source.bytes]));

    // When
    const result = qualifyComparatorsBeforeSynthesis(sources);

    // Then
    expect(result).toMatchObject({
      status: "available",
      qualification: {
        status: "qualified",
        rawPeerArtifactId: "peer-artifact",
        rawArtifactCount: 3,
        valuation: {
          status: "eligible",
          peerMedian: 25,
          eligibleCompanyCount: 3,
        },
      },
    });
    expect(JSON.stringify(sources.map((source) => [...source.bytes]))).toBe(before);
  });

  it("returns a typed no-data state for malformed sealed peer bytes", () => {
    // Given
    const sources = [
      {
        evidenceId: "insightsentry:peers",
        artifactId: "bad-peer-artifact",
        bytes: new TextEncoder().encode("not-json"),
      },
    ];

    // When
    const result = qualifyComparatorsBeforeSynthesis(sources);

    // Then
    expect(result).toEqual({
      status: "not_available",
      reason: "peer_evidence_malformed",
      rawPeerArtifactId: "bad-peer-artifact",
    });
  });
});
