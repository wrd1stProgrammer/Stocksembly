import { describe, expect, it } from "vitest";
import { valueRecordHash } from "../domain/valueRegistry";
import { SnapshotBuilderV1, type SnapshotEvidence } from "./buildSnapshot";
import {
  makeHarness,
  RUN_ID,
  requireSealed,
  SNAPSHOT_ID,
} from "./buildSnapshot.testSupport";

export function registerSnapshotCorrectiveTests(): void {
  describe("SnapshotBuilderV1 corrective trust boundaries", () => {
    it("rejects a validly rehashed foreign value inside a local registry", async () => {
      // Given
      const harness = makeHarness();
      const record = harness.input.valueRegistry?.records[0];
      if (record === undefined) throw new TypeError("value fixture missing");
      const foreignDraft = {
        ...record,
        runId: "00000000-0000-4000-8000-000000000099",
        hash: "0".repeat(64),
      };
      const foreign = { ...foreignDraft, hash: valueRecordHash(foreignDraft) };
      const input = {
        ...harness.input,
        valueRegistry: {
          runId: RUN_ID,
          snapshotId: SNAPSHOT_ID,
          records: [foreign],
        },
      };

      // When
      const result = await harness.builder.build(input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["cross_run"],
      });
      expect(harness.repository.operations).not.toContain("snapshot_sealed");
    });

    it("rejects caller-minted capability availability", async () => {
      // Given
      const harness = makeHarness();
      const input = {
        ...harness.input,
        capabilities: {
          version: harness.input.capabilities.version,
          disclosures: harness.input.capabilities.disclosures.map(
            ({ key, state }) => ({ key, state: { ...state } }),
          ),
        },
      };

      // When
      const result = await harness.builder.build(input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["capability_untrusted"],
      });
    });

    it("rejects duplicate trusted capability disclosures", async () => {
      // Given
      const harness = makeHarness();
      const duplicate = harness.input.capabilities.disclosures[0];
      if (duplicate === undefined)
        throw new TypeError("capability fixture missing");
      const input = {
        ...harness.input,
        capabilities: {
          ...harness.input.capabilities,
          disclosures: [...harness.input.capabilities.disclosures, duplicate],
        },
      };

      // When
      const result = await harness.builder.build(input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["capability_manifest_duplicate"],
      });
      expect(harness.repository.operations).toEqual([]);
    });

    it("rejects contradictory trusted duplicates before source policy", async () => {
      // Given
      const harness = makeHarness();
      const alternate = makeHarness({ relabelIdentityCapability: true });
      const contradictory = alternate.input.capabilities.disclosures.find(
        ({ key }) => key === "identity",
      );
      if (contradictory === undefined)
        throw new TypeError("contradictory capability fixture missing");
      const input = {
        ...harness.input,
        capabilities: {
          ...harness.input.capabilities,
          disclosures: [
            ...harness.input.capabilities.disclosures,
            contradictory,
          ],
        },
      };

      // When
      const result = await harness.builder.build(input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["capability_manifest_duplicate"],
      });
      expect(harness.repository.operations).toEqual([]);
    });

    it("uses SnapshotClockPort-issued lifecycle instants", async () => {
      // Given
      const harness = makeHarness();
      const dependencies = {
        cas: harness.cas,
        repository: harness.repository,
        clock: {
          collectionStartedAt: () => "2026-07-22T00:01:30.000Z",
          closeAndCutoff: () => ({
            acquisitionClosedAt: "2026-07-22T00:03:00.000Z",
            evidenceCutoffAt: "2026-07-22T00:04:00.000Z",
          }),
          snapshotSealedAt: () => "2026-07-22T00:05:00.000Z",
          mandateSealedAt: () => "2026-07-22T00:06:00.000Z",
        },
      };
      const builder = new SnapshotBuilderV1(dependencies);

      // When
      const sealed = requireSealed(await builder.build(harness.input));

      // Then
      expect(sealed.manifest.collectionStartedAt).toBe(
        "2026-07-22T00:01:30.000Z",
      );
    });

    it("rejects retrieval before clock-issued collection start", async () => {
      // Given
      const harness = makeHarness({
        evidenceRetrievedAt: "2026-07-22T00:00:30.000Z",
      });

      // When
      const result = await harness.builder.build(harness.input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["retrieved_before_collection"],
      });
    });

    it("rejects an amendment whose parent accession is absent", async () => {
      // Given
      const harness = makeHarness();
      const evidence = harness.evidence.map(
        (item): SnapshotEvidence =>
          item.evidenceId === "annual-amendment"
            ? { ...item, parentAccessionNumber: "0000000000-26-999999" }
            : item,
      );
      const input = {
        ...harness.input,
        collect: async (
          register: (item: SnapshotEvidence) => Promise<void>,
        ) => {
          for (const item of evidence) await register(item);
        },
      };

      // When
      const result = await harness.builder.build(input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["amendment_parent_missing"],
      });
      expect(harness.repository.operations).not.toContain("snapshot_sealed");
    });
  });
}
