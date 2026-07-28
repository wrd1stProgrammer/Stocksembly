import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type CapabilityAvailability,
  serializeCapabilityDisclosures,
} from "./capabilities";
import {
  createCapabilityDisclosureForSourceAssessment,
  createCapabilitySourceAssessment,
  createDefaultCapabilityManifestForIdentity,
  createWithheldCapabilityDisclosureForIdentity,
} from "./capabilities.internal";
import { assertNever } from "./ids";
import { RunIdSchema, SnapshotIdSchema } from "./ids";
import type {
  ArtifactCasPort,
  ArtifactDescriptor,
  ArtifactDigest,
  ArtifactRead,
  ArtifactWrite,
} from "../ports/artifacts";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { hashBytes } from "./contractHelpers";
import { evaluateModelTransfer } from "./rights";
import { isSupportedSecurityIdentity } from "./securityIdentity";
import { admitFixtureSecurityIdentity } from "./securityIdentity.test-support";
import {
  attestLicensedProviderCapability,
  commitLicensedProviderEvidence,
} from "../server/data/insightsentry/insightSentryEvidence";

class CapabilityCas implements ArtifactCasPort {
  readonly values = new Map<ArtifactDigest, ArtifactRead>();

  async put(write: ArtifactWrite): Promise<ArtifactDescriptor> {
    const digest = ArtifactDigestSchema.parse(hashBytes(write.bytes));
    const descriptor = Object.freeze({
      artifactId: write.artifactId,
      runId: write.runId,
      snapshotId: write.snapshotId,
      digest,
      byteLength: write.bytes.byteLength,
      mediaType: write.mediaType,
      parentDigests: Object.freeze([...write.parentDigests]),
    });
    this.values.set(digest, { descriptor, bytes: write.bytes });
    return descriptor;
  }

  async get(digest: ArtifactDigest): Promise<ArtifactRead | undefined> {
    return this.values.get(digest);
  }

  async has(digest: ArtifactDigest): Promise<boolean> {
    return this.values.has(digest);
  }
}

const admittedIdentityInput = {
  submittedSymbol: "NVDA",
  tickerExchangeRows: [{ symbol: "NVDA", cik: "1045810", exchange: "Nasdaq" }],
  filingForms: [
    { form: "10-K", cik: "1045810" },
    { form: "10-Q", cik: "1045810" },
    { form: "8-K", cik: "1045810" },
  ],
  coverPages: [
    {
      form: "10-K",
      tradingSymbol: "NVDA",
      cik: "1045810",
      securityExchangeName: "Nasdaq",
      security12bTitle: "Common Stock",
    },
  ],
};

function availabilityTag(value: CapabilityAvailability): string {
  switch (value.availability) {
    case "available":
      return "available";
    case "stale":
      return "stale";
    case "unavailable":
      return "unavailable";
    case "withheld_by_rights":
      return "withheld_by_rights";
    default:
      return assertNever(value);
  }
}

describe("capability disclosures", () => {
  it("attests a fresh licensed capability only after raw and normalized CAS commit", async () => {
    const cas = new CapabilityCas();
    const evidence = await commitLicensedProviderEvidence({
      cas,
      runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000001"),
      snapshotId: SnapshotIdSchema.parse(
        "00000000-0000-4000-8000-000000000002",
      ),
      rawBytes: new TextEncoder().encode('{"bars":[1]}'),
      normalized: { bars: [{ close: 1 }] },
      schema: z.object({
        bars: z.array(z.object({ close: z.number() }).strict()),
      }).strict(),
      rawMediaType: "application/json",
      normalizedMediaType: "application/vnd.stocksembly.normalized+json",
      retrievedAt: "2026-07-24T00:00:00.000Z",
      freshThrough: "2026-07-24T01:00:00.000Z",
      schemaVersion: "insightsentry-market-v1",
      rightsSource: "insightsentry_rapidapi",
    });

    const disclosure = await attestLicensedProviderCapability({
      cas,
      identity: {
        cik: "0001045810",
        ticker: "NVDA",
        exchange: "NASDAQ",
        identityHash: "a".repeat(64),
      },
      key: "current_market_data",
      evidence,
      now: "2026-07-24T00:30:00.000Z",
    });

    expect(disclosure?.state).toEqual({
      availability: "available",
      source: "licensed_provider",
    });
    expect(evidence.normalized.parentDigests).toEqual([evidence.raw.digest]);
  });

  it("fails closed for missing raw lineage or denied rights and classifies expired evidence as stale", async () => {
    const cas = new CapabilityCas();
    const evidence = await commitLicensedProviderEvidence({
      cas,
      runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000001"),
      snapshotId: SnapshotIdSchema.parse(
        "00000000-0000-4000-8000-000000000002",
      ),
      rawBytes: new TextEncoder().encode('{"news":[1]}'),
      normalized: { events: [1] },
      schema: z.object({ events: z.array(z.number()) }).strict(),
      rawMediaType: "application/json",
      normalizedMediaType: "application/vnd.stocksembly.normalized+json",
      retrievedAt: "2026-07-24T00:00:00.000Z",
      freshThrough: "2026-07-24T01:00:00.000Z",
      schemaVersion: "insightsentry-news-v1",
      rightsSource: "insightsentry_rapidapi",
    });
    const identity = {
      cik: "0001045810",
      ticker: "NVDA",
      exchange: "NASDAQ",
      identityHash: "a".repeat(64),
    };

    const stale = await attestLicensedProviderCapability({
      cas,
      identity,
      key: "professional_news",
      evidence,
      now: "2026-07-24T02:00:00.000Z",
    });
    const missingParent = await attestLicensedProviderCapability({
      cas,
      identity,
      key: "professional_news",
      evidence: {
        ...evidence,
        normalized: { ...evidence.normalized, parentDigests: [] },
      },
      now: "2026-07-24T00:30:00.000Z",
    });
    const deniedRights = await attestLicensedProviderCapability({
      cas,
      identity,
      key: "professional_news",
      evidence: { ...evidence, rightsSource: "sec_exhibit" },
      now: "2026-07-24T00:30:00.000Z",
    });

    expect(stale?.state).toEqual({
      availability: "stale",
      source: "licensed_provider",
      staleSince: "2026-07-24T01:00:00.000Z",
    });
    expect(missingParent).toBeUndefined();
    expect(deniedRights).toBeUndefined();
  });

  it("does not commit provider evidence that fails its declared schema", async () => {
    const cas = new CapabilityCas();

    await expect(
      commitLicensedProviderEvidence({
        cas,
        runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000001"),
        snapshotId: SnapshotIdSchema.parse(
          "00000000-0000-4000-8000-000000000002",
        ),
        rawBytes: new TextEncoder().encode('{"bars":"invalid"}'),
        normalized: { bars: "invalid" },
        schema: z
          .object({ bars: z.array(z.object({ close: z.number() }).strict()) })
          .strict(),
        rawMediaType: "application/json",
        normalizedMediaType: "application/vnd.stocksembly.normalized+json",
        retrievedAt: "2026-07-24T00:00:00.000Z",
        freshThrough: "2026-07-24T01:00:00.000Z",
        schemaVersion: "insightsentry-market-v1",
        rightsSource: "insightsentry_rapidapi",
      }),
    ).rejects.toThrow();
    expect(cas.values.size).toBe(0);
  });

  it("serializes the default official and explicitly unavailable posture", () => {
    const admission = admitFixtureSecurityIdentity(admittedIdentityInput);
    expect(admission.kind).toBe("admitted");
    if (admission.kind !== "admitted") return;
    const manifest = createDefaultCapabilityManifestForIdentity(
      admission.identity,
    );
    expect(manifest).toBeDefined();
    if (manifest === undefined) return;
    const encoded = serializeCapabilityDisclosures(manifest);
    const parsed: unknown = JSON.parse(encoded);

    expect(parsed).toEqual({
      version: "workflow-v1",
      capabilities: {
        identity: "available",
        sec_filings: "available",
        sec_company_facts: "available",
        bls_macro: "available",
        treasury_yield: "available",
        current_market_data: "unavailable",
        consensus: "unavailable",
        professional_news: "unavailable",
        options: "unavailable",
        short_interest: "unavailable",
      },
    });
  });

  it("preserves stale and rights-withheld states as distinct outcomes", () => {
    const admission = admitFixtureSecurityIdentity(admittedIdentityInput);
    expect(admission.kind).toBe("admitted");
    if (admission.kind !== "admitted") return;

    const stale = createCapabilityDisclosureForSourceAssessment(
      admission.identity,
      createCapabilitySourceAssessment("sec_filings", {
        availability: "stale",
        source: "official_sec",
        staleSince: "2026-07-01T00:00:00.000Z",
      }),
    );
    const withheld = createWithheldCapabilityDisclosureForIdentity(
      admission.identity,
      "professional_news",
      "rights_denied",
    );

    expect(stale).toBeDefined();
    expect(withheld).toBeDefined();
    if (stale === undefined) return;
    if (withheld === undefined) return;
    expect(availabilityTag(stale.state)).toBe("stale");
    expect(availabilityTag(withheld.state)).toBe("withheld_by_rights");
    expect(withheld.state).toEqual({
      availability: "withheld_by_rights",
      reason: "rights_denied",
    });
  });

  it("does not mint a trusted disclosure from plain client-shaped JSON", () => {
    const plainIdentity = {
      ticker: "NVDA",
      cik: "0001045810",
      exchange: "NASDAQ",
      securityClass: "common_stock",
    };

    const disclosure = createCapabilityDisclosureForSourceAssessment(
      plainIdentity,
      createCapabilitySourceAssessment("identity", {
        availability: "available",
        source: "official_sec",
      }),
    );

    expect(disclosure).toBeUndefined();
  });

  it("does not trust an admitted identity after JSON round-trip", () => {
    const admission = admitFixtureSecurityIdentity(admittedIdentityInput);
    expect(admission.kind).toBe("admitted");
    if (admission.kind !== "admitted") return;

    const roundTripped: unknown = JSON.parse(
      JSON.stringify(admission.identity),
    );
    expect(
      createCapabilityDisclosureForSourceAssessment(
        roundTripped,
        createCapabilitySourceAssessment("identity", {
          availability: "available",
          source: "official_sec",
        }),
      ),
    ).toBeUndefined();
  });

  it("does not trust a full enumerable-key and symbol copy of an identity", () => {
    const admission = admitFixtureSecurityIdentity(admittedIdentityInput);
    expect(admission.kind).toBe("admitted");
    if (admission.kind !== "admitted") return;

    const copied = Object.defineProperties(
      {},
      Object.getOwnPropertyDescriptors(admission.identity),
    );
    expect(isSupportedSecurityIdentity(copied)).toBe(false);
    expect(
      createCapabilityDisclosureForSourceAssessment(
        copied,
        createCapabilitySourceAssessment("identity", {
          availability: "available",
          source: "official_sec",
        }),
      ),
    ).toBeUndefined();
  });

  it("does not let copied identity fields mint internal manifests or withheld disclosures", () => {
    const admission = admitFixtureSecurityIdentity(admittedIdentityInput);
    expect(admission.kind).toBe("admitted");
    if (admission.kind !== "admitted") return;

    const copied = { ...admission.identity };
    expect(createDefaultCapabilityManifestForIdentity(copied)).toBeUndefined();
    expect(
      createWithheldCapabilityDisclosureForIdentity(
        copied,
        "professional_news",
        "rights_denied",
      ),
    ).toBeUndefined();
  });

  it("requires an opaque source assessment before internal minting", () => {
    const admission = admitFixtureSecurityIdentity(admittedIdentityInput);
    expect(admission.kind).toBe("admitted");
    if (admission.kind !== "admitted") return;

    const assessment = createCapabilitySourceAssessment("identity", {
      availability: "available",
      source: "official_sec",
    });
    const copiedAssessment = { ...assessment };
    expect(
      createCapabilityDisclosureForSourceAssessment(
        admission.identity,
        copiedAssessment,
      ),
    ).toBeUndefined();
  });

  it("blocks model transfer for an unknown rights source", () => {
    const result = evaluateModelTransfer("unregistered_source");

    expect(result).toEqual({ kind: "blocked", reason: "rights_unknown" });
    expect("runId" in result).toBe(false);
  });

  it("does not expose authority-minting constructors publicly", async () => {
    const publicCapabilities = await import("./capabilities");

    expect("createCapabilityDisclosureForIdentity" in publicCapabilities).toBe(
      false,
    );
    expect("createDefaultCapabilityManifest" in publicCapabilities).toBe(false);
    expect("createWithheldCapabilityDisclosure" in publicCapabilities).toBe(
      false,
    );
  });
});
