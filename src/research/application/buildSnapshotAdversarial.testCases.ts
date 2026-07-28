import { describe, expect, it } from "vitest";
import type { SnapshotEvidence } from "./buildSnapshot";
import {
  MemoryCas,
  MemorySnapshotRepository,
  makeHarness,
  RUN_ID,
  requireSealed,
  SNAPSHOT_ID,
} from "./buildSnapshot.testSupport";

export function registerSnapshotAdversarialTests(): void {
  describe("SnapshotBuilderV1 fail-closed policy", () => {
    it("excludes rights-withheld content and discloses unavailable licensed datasets", async () => {
      // Given
      const harness = makeHarness({ includeExhibit: true });

      // When
      const sealed = requireSealed(await harness.builder.build(harness.input));

      // Then
      expect(
        sealed.manifest.artifacts.map((item) => item.evidenceId),
      ).not.toContain("withheld-exhibit");
      expect(sealed.manifest.limitations).toEqual(
        expect.arrayContaining([
          "rights_excluded:withheld-exhibit",
          "current_market_data:unavailable",
          "consensus:unavailable",
        ]),
      );
    });

    it.each([
      ["identity", { includeIdentity: false }],
      ["10-K", { include10k: false }],
      ["current Company Facts", { includeFacts: false }],
    ])(
      "does not seal when mandatory %s evidence is missing",
      async (_label, options) => {
        // Given
        const harness = makeHarness(options);

        // When
        const result = await harness.builder.build(harness.input);

        // Then
        expect(result.kind).toBe("incomplete");
        expect(harness.repository.operations).not.toContain("snapshot_sealed");
        expect(harness.repository.operations).not.toContain("mandate_sealed");
      },
    );

    it("seals optional macro failure as an explicit limitation", async () => {
      // Given
      const harness = makeHarness({
        includeMacro: false,
        macroFailure: true,
      });

      // When
      const sealed = requireSealed(await harness.builder.build(harness.input));

      // Then
      expect(sealed.manifest.limitations).toEqual(
        expect.arrayContaining([
          "bls_macro:unavailable",
          "bls_macro_failure:transport_unavailable",
        ]),
      );
    });

    it("does not seal when mandatory Company Facts transfer rights are denied", async () => {
      // Given
      const harness = makeHarness({ factsRightsDenied: true });

      // When
      const result = await harness.builder.build(harness.input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["sec_company_facts_capability_unavailable"],
      });
      expect(harness.repository.operations).not.toContain("snapshot_sealed");
    });

    it("rejects future retrievals before closing or sealing", async () => {
      // Given
      const harness = makeHarness({
        evidenceRetrievedAt: "2026-07-22T00:04:00.001Z",
      });

      // When
      const result = await harness.builder.build(harness.input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["post_cutoff"],
      });
      expect(harness.repository.operations).not.toContain(
        "close_and_cutoff_transaction",
      );
      expect(harness.repository.operations).not.toContain("snapshot_sealed");
    });

    it("rejects a filing accepted after the authoritative cutoff", async () => {
      // Given
      const harness = makeHarness();
      const evidence = harness.evidence.map((item) => {
        if (item.evidenceId === "annual")
          return {
            ...item,
            acceptedAt: "2026-07-22T00:04:00.001Z",
            retrievedAt: "2026-07-22T00:04:00.001Z",
          };
        if (item.evidenceId === "annual-amendment")
          return {
            ...item,
            acceptedAt: "2026-07-22T00:04:00.002Z",
            retrievedAt: "2026-07-22T00:04:00.002Z",
          };
        return item;
      });
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
        reasons: ["post_cutoff"],
      });
      expect(harness.repository.operations).not.toContain("snapshot_sealed");
    });

    it("rejects cross-run artifact lineage and corrupted CAS bytes", async () => {
      // Given
      const foreignCas = new MemoryCas();
      const repository = new MemorySnapshotRepository();
      const foreign = foreignCas.add("foreign", {
        runId: "00000000-0000-4000-8000-000000000099",
        snapshotId: SNAPSHOT_ID,
      });
      const crossRun = makeHarness({}, { cas: foreignCas, repository });
      const first = crossRun.evidence[0];
      if (first === undefined) throw new TypeError("identity fixture missing");
      const injected: SnapshotEvidence = { ...first, raw: foreign };
      const crossInput = {
        ...crossRun.input,
        collect: async (
          register: (evidence: SnapshotEvidence) => Promise<void>,
        ) => {
          await register(injected);
        },
      };

      // When
      const crossResult = await crossRun.builder.build(crossInput);
      const corrupt = makeHarness();
      const identity = corrupt.evidence[0];
      if (identity === undefined)
        throw new TypeError("identity fixture missing");
      corrupt.cas.corrupt(identity.raw.digest);
      const corruptResult = await corrupt.builder.build(corrupt.input);

      // Then
      expect(crossResult).toMatchObject({
        kind: "incomplete",
        reasons: ["cross_run"],
      });
      expect(corruptResult).toMatchObject({
        kind: "incomplete",
        reasons: ["cas_hash_mismatch"],
      });
    });

    it("rejects a mandate timestamp that would seal mandate first", async () => {
      // Given
      const harness = makeHarness({
        mandateSealedAt: "2026-07-22T00:05:00.000Z",
      });

      // When
      const result = await harness.builder.build(harness.input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["mandate_first"],
      });
      expect(harness.repository.operations).not.toContain("snapshot_sealed");
      expect(harness.repository.operations).not.toContain("mandate_sealed");
    });

    it("rejects a tampered value registry hash", async () => {
      // Given
      const harness = makeHarness();
      const record = harness.input.valueRegistry?.records[0];
      if (record === undefined) throw new TypeError("value fixture missing");
      const input = {
        ...harness.input,
        valueRegistry: {
          runId: RUN_ID,
          snapshotId: SNAPSHOT_ID,
          records: [{ ...record, hash: "0".repeat(64) }],
        },
      };

      // When
      const result = await harness.builder.build(input);

      // Then
      expect(result).toMatchObject({
        kind: "incomplete",
        reasons: ["value_hash_mismatch"],
      });
      expect(harness.repository.operations).not.toContain("snapshot_sealed");
    });
  });
}
