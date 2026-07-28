import { describe, expect, it } from "vitest";
import type { SnapshotEvidence } from "./buildSnapshot";
import { makeHarness } from "./buildSnapshot.testSupport";

type EvidenceMutation = (item: SnapshotEvidence) => SnapshotEvidence;

function inputWithEvidence(
  harness: ReturnType<typeof makeHarness>,
  mutate: EvidenceMutation,
) {
  const evidence = harness.evidence.map(mutate);
  return {
    ...harness.input,
    collect: async (register: (item: SnapshotEvidence) => Promise<void>) => {
      for (const item of evidence) await register(item);
    },
  };
}

export function registerSnapshotLineageCorrectiveTests(): void {
  describe("SnapshotBuilderV1 exact authority mappings", () => {
    it("requires an InsightSentry normalized child of the committed raw bytes", async () => {
      // Given
      const harness = makeHarness();
      const raw = harness.cas.add("provider-raw", {
        runId: harness.input.runId,
        snapshotId: harness.input.snapshotId,
      });
      const providerEvidence: SnapshotEvidence = {
        evidenceId: "insightsentry:market-bars",
        dataset: "market_bars",
        rightsSource: "insightsentry_rapidapi",
        retrievedAt: "2026-07-22T00:02:00.000Z",
        raw,
      };
      const input = {
        ...harness.input,
        collect: async (
          register: (item: SnapshotEvidence) => Promise<void>,
        ) => {
          for (const item of harness.evidence) await register(item);
          await register(providerEvidence);
        },
      };

      // When
      const result = await harness.builder.build(input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["provider_normalized_missing"],
      });
    });

    it("seals both InsightSentry CAS digests into the snapshot manifest", async () => {
      // Given
      const harness = makeHarness();
      const raw = harness.cas.add("provider-raw", {
        runId: harness.input.runId,
        snapshotId: harness.input.snapshotId,
      });
      const normalized = harness.cas.add(
        "provider-normalized",
        {
          runId: harness.input.runId,
          snapshotId: harness.input.snapshotId,
        },
        [raw.digest],
      );
      const input = {
        ...harness.input,
        collect: async (
          register: (item: SnapshotEvidence) => Promise<void>,
        ) => {
          for (const item of harness.evidence) await register(item);
          await register({
            evidenceId: "insightsentry:market-bars",
            dataset: "market_bars",
            rightsSource: "insightsentry_rapidapi",
            retrievedAt: "2026-07-22T00:02:00.000Z",
            raw,
            normalized,
          });
        },
      };

      // When
      const result = await harness.builder.build(input);

      // Then
      expect(result).toMatchObject({
        kind: "sealed",
        manifest: {
          artifacts: expect.arrayContaining([
            expect.objectContaining({
              evidenceId: "insightsentry:market-bars",
              rawHash: raw.digest,
              normalizedHash: normalized.digest,
            }),
          ]),
        },
      });
    });

    it("rejects a trusted disclosure whose declared source is relabeled", async () => {
      // Given
      const harness = makeHarness({ relabelIdentityCapability: true });

      // When
      const result = await harness.builder.build(harness.input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["capability_source_mismatch"],
      });
      expect(harness.repository.operations).toEqual([]);
    });

    it("rejects an evidence dataset whose rights source is relabeled", async () => {
      // Given
      const harness = makeHarness();
      const input = inputWithEvidence(harness, (item) =>
        item.evidenceId === "macro"
          ? { ...item, rightsSource: "treasury_yield" }
          : item,
      );

      // When
      const result = await harness.builder.build(input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["rights_source_mismatch"],
      });
      expect(harness.repository.operations).not.toContain("snapshot_sealed");
    });

    it("rejects retrieval after acquisition close even before cutoff", async () => {
      // Given
      const harness = makeHarness({
        evidenceRetrievedAt: "2026-07-22T00:03:30.000Z",
      });

      // When
      const result = await harness.builder.build(harness.input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["post_cutoff"],
      });
      expect(harness.repository.operations).not.toContain("snapshot_sealed");
    });
  });

  describe("SnapshotBuilderV1 amendment lineage", () => {
    it.each<{
      readonly label: string;
      readonly reason: string;
      readonly mutate: EvidenceMutation;
    }>([
      {
        label: "cross-issuer filing",
        reason: "amendment_cross_issuer",
        mutate: (item) =>
          item.evidenceId === "annual-amendment"
            ? { ...item, cik: "0000000001" }
            : item,
      },
      {
        label: "cycle",
        reason: "amendment_cycle",
        mutate: (item) =>
          item.evidenceId === "annual"
            ? {
                ...item,
                parentAccessionNumber: "0000000000-26-000002",
              }
            : item,
      },
      {
        label: "cross-form-family parent",
        reason: "amendment_form_family",
        mutate: (item) =>
          item.evidenceId === "annual-amendment"
            ? { ...item, form: "10-Q/A" }
            : item,
      },
      {
        label: "non-preceding parent",
        reason: "amendment_order",
        mutate: (item) =>
          item.evidenceId === "annual"
            ? { ...item, acceptedAt: "2026-07-21T02:00:00.000Z" }
            : item,
      },
    ])("rejects $label", async ({ mutate, reason }) => {
      // Given
      const harness = makeHarness();
      const input = inputWithEvidence(harness, mutate);

      // When
      const result = await harness.builder.build(input);

      // Then
      expect(result).toMatchObject({ kind: "incomplete", reasons: [reason] });
      expect(harness.repository.operations).not.toContain("snapshot_sealed");
    });
  });
}
