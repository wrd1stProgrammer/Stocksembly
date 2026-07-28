import { describe, expect, it } from "vitest";
import type { SnapshotRegister } from "./buildSnapshot";
import {
  LATER_SNAPSHOT_ID,
  MemoryCas,
  MemorySnapshotRepository,
  makeHarness,
  requireSealed,
} from "./buildSnapshot.testSupport";

export function registerSnapshotCoreTests(): void {
  describe("SnapshotBuilderV1 authoritative sealing", () => {
    it("durably registers bounded evidence, atomically closes, seals snapshot, then mandate", async () => {
      // Given
      const harness = makeHarness({ includeExhibit: true });

      // When
      const sealed = requireSealed(await harness.builder.build(harness.input));
      const agentManifest = await harness.builder.openForAgent(
        sealed.manifest.manifestHash,
      );

      // Then
      expect(harness.repository.operations).toEqual([
        "collection_started",
        "registered:identity",
        "registered:annual",
        "registered:annual-amendment",
        "registered:facts",
        "registered:macro",
        "registered:withheld-exhibit",
        "close_and_cutoff_transaction",
        "snapshot_sealed",
        "mandate_sealed",
      ]);
      expect(agentManifest).toEqual(sealed.manifest);
      expect(Reflect.has(agentManifest ?? {}, "body")).toBe(false);
      expect(sealed.manifest).toMatchObject({
        identity: { ticker: "TEST", identityHash: "a".repeat(64) },
        versions: { schema: "snapshot-v1", rightsPolicy: "rights-v1" },
        amendments: [
          {
            accessionNumber: "0000000000-26-000002",
            parentAccessionNumber: "0000000000-26-000001",
          },
        ],
      });
      expect(
        sealed.manifest.artifacts.some((item) => item.normalizedHash),
      ).toBe(true);
      expect(sealed.manifest.valueRegistry.records).toHaveLength(1);
      expect(sealed.mandate.manifestHash).toBe(sealed.manifest.manifestHash);
    });

    it("is collection-order deterministic and reuses identical verified evidence without mutation", async () => {
      // Given
      const cas = new MemoryCas();
      const repository = new MemorySnapshotRepository();
      const first = makeHarness({}, { cas, repository });
      const firstResult = requireSealed(await first.builder.build(first.input));
      const before = JSON.stringify(firstResult);
      const replay = makeHarness(
        {
          snapshotSealedAt: "2026-07-22T00:07:00.000Z",
          mandateSealedAt: "2026-07-22T00:08:00.000Z",
        },
        { cas, repository },
      );
      const reverseInput = {
        ...replay.input,
        collect: async (register: SnapshotRegister) => {
          for (const item of [...replay.evidence].reverse())
            await register(item);
        },
      };

      // When
      const replayResult = requireSealed(
        await replay.builder.build(reverseInput),
      );

      // Then
      expect(replayResult.reused).toBe(true);
      expect(replayResult.manifest.manifestHash).toBe(
        firstResult.manifest.manifestHash,
      );
      expect(JSON.stringify(firstResult)).toBe(before);
      expect(
        repository.operations.filter((item) => item === "snapshot_sealed"),
      ).toHaveLength(1);
    });

    it("creates a new immutable snapshot for a later authoritative cutoff", async () => {
      // Given
      const first = makeHarness();
      const firstResult = requireSealed(await first.builder.build(first.input));
      const later = makeHarness(
        {
          snapshotId: LATER_SNAPSHOT_ID,
          cutoffAt: "2026-07-22T00:07:00.000Z",
          snapshotSealedAt: "2026-07-22T00:08:00.000Z",
          mandateSealedAt: "2026-07-22T00:09:00.000Z",
        },
        { cas: first.cas, repository: first.repository },
      );

      // When
      const laterResult = requireSealed(await later.builder.build(later.input));

      // Then
      expect(laterResult.reused).toBe(false);
      expect(laterResult.manifest.manifestHash).not.toBe(
        firstResult.manifest.manifestHash,
      );
      expect(laterResult.manifest.evidenceCutoffAt).toBe(
        "2026-07-22T00:07:00.000Z",
      );
    });

    it("rejects registration after acquisition closes", async () => {
      // Given
      const harness = makeHarness();
      await harness.builder.build(harness.input);
      const register = harness.lateRegister();
      const evidence = harness.evidence[0];
      if (register === undefined || evidence === undefined)
        throw new TypeError("late registration fixture missing");

      // When / Then
      await expect(register(evidence)).rejects.toMatchObject({
        code: "acquisition_closed",
      });
    });
  });
}
