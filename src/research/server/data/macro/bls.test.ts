import { afterEach, describe, expect, it } from "vitest";
import {
  BLS_SOURCE_URL,
  createBlsAdapter,
  type MacroHttpTransport,
  sealBlsCollection,
} from "./bls";
import {
  BLS_TEST_NOW,
  blsPayload,
  cleanupBlsTestRoots,
  createBlsTestRoot,
} from "./bls.testSupport";
import { registerBlsPersistenceTestCases } from "./blsPersistence.testCases";

afterEach(async () => {
  await cleanupBlsTestRoots();
});

describe("BLS exact keyless allowlist", () => {
  it.each(["text", "NaN", "Infinity", "1,000", "12 percent"])(
    "degrades an HTTP 200 response carrying non-decimal value %s",
    async (invalidValue) => {
      // Given
      let calls = 0;
      const adapter = createBlsAdapter({
        dataRoot: await createBlsTestRoot(),
        transport: async () => {
          calls += 1;
          return {
            status: 200,
            headers: {},
            body: blsPayload("CUUR0000SA0", invalidValue),
          };
        },
        clock: { isoNow: () => BLS_TEST_NOW, sleep: async () => undefined },
      });

      // When
      const result = await adapter.collect({
        seriesId: "CUUR0000SA0",
        startYear: 2026,
        endYear: 2026,
      });

      // Then
      expect(result).toEqual({ status: "degraded", reason: "payload_invalid" });
      expect(calls).toBe(1);
    },
  );

  it("does not cache a malformed HTTP 200 BLS value", async () => {
    // Given
    let calls = 0;
    const adapter = createBlsAdapter({
      dataRoot: await createBlsTestRoot(),
      transport: async () => {
        calls += 1;
        return {
          status: 200,
          headers: {},
          body: blsPayload("CUUR0000SA0", calls === 1 ? "NaN" : "321.500"),
        };
      },
      clock: { isoNow: () => BLS_TEST_NOW, sleep: async () => undefined },
    });
    const request = {
      seriesId: "CUUR0000SA0",
      startYear: 2026,
      endYear: 2026,
    };

    // When
    const malformed = await adapter.collect(request);
    const corrected = await adapter.collect(request);

    // Then
    expect(malformed).toEqual({
      status: "degraded",
      reason: "payload_invalid",
    });
    expect(corrected.status).toBe("available");
    expect(calls).toBe(2);
  });

  it("preserves request, observations, missing markers, footnotes, and provenance", async () => {
    // Given
    const calls: string[] = [];
    const transport: MacroHttpTransport = async (request) => {
      calls.push(request.url);
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: blsPayload(
          request.body?.includes("LNS14000000") ? "LNS14000000" : "CUUR0000SA0",
          request.body?.includes("LNS14000000") ? "-" : "321.500",
        ),
      };
    };
    const adapter = createBlsAdapter({
      dataRoot: await createBlsTestRoot(),
      transport,
      clock: { isoNow: () => BLS_TEST_NOW, sleep: async () => undefined },
    });

    // When
    const cpi = await adapter.collect({
      seriesId: "CUUR0000SA0",
      startYear: 2026,
      endYear: 2026,
    });
    const jobs = await adapter.collect({
      seriesId: "LNS14000000",
      startYear: 2026,
      endYear: 2026,
    });

    // Then
    expect(cpi.status).toBe("available");
    expect(jobs.status).toBe("available");
    if (cpi.status !== "available" || jobs.status !== "available") return;
    expect(cpi.request).toEqual({
      seriesId: "CUUR0000SA0",
      startYear: 2026,
      endYear: 2026,
    });
    expect(cpi.observations[0]).toMatchObject({
      seriesId: "CUUR0000SA0",
      observationDate: "2026-06-01",
      rawValue: "321.500",
      value: { kind: "present", decimal: "321.500" },
    });
    expect(jobs.observations[0]).toMatchObject({
      rawValue: "-",
      value: { kind: "missing", marker: "-" },
      footnotes: [{ code: "-", text: "Data not available" }],
    });
    expect(cpi.releaseTime).toEqual({ availability: "unavailable" });
    expect(cpi.provenance).toMatchObject({
      sourceUrl: BLS_SOURCE_URL,
      retrievedAt: BLS_TEST_NOW,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      freshness: "fresh",
    });
    expect(calls).toEqual([BLS_SOURCE_URL, BLS_SOURCE_URL]);
  });

  it("rejects an arbitrary series and an unauthorized range before transport", async () => {
    // Given
    let calls = 0;
    const adapter = createBlsAdapter({
      dataRoot: await createBlsTestRoot(),
      transport: async () => {
        calls += 1;
        return { status: 200, headers: {}, body: blsPayload() };
      },
      clock: { isoNow: () => BLS_TEST_NOW, sleep: async () => undefined },
    });

    // When
    const arbitrary = await adapter.collect({
      seriesId: "CPIAUCSL",
      startYear: 2026,
      endYear: 2026,
    });
    const longRange = await adapter.collect({
      seriesId: "CUUR0000SA0",
      startYear: 2016,
      endYear: 2026,
    });

    // Then
    expect(arbitrary).toMatchObject({
      status: "degraded",
      reason: "series_not_allowed",
    });
    expect(longRange).toMatchObject({
      status: "degraded",
      reason: "range_not_allowed",
    });
    expect(calls).toBe(0);
  });

  it.each([
    "CUUR0000SA0L1E",
    "CES0000000001",
    "CES0500000003",
    "WPUFD4",
  ] as const)("collects the expanded official macro series %s", async (seriesId) => {
    const adapter = createBlsAdapter({
      dataRoot: await createBlsTestRoot(),
      transport: async () => ({
        status: 200,
        headers: {},
        body: blsPayload(seriesId, "123.45"),
      }),
      clock: { isoNow: () => BLS_TEST_NOW, sleep: async () => undefined },
    });

    const result = await adapter.collect({
      seriesId,
      startYear: 2026,
      endYear: 2026,
    });

    expect(result).toMatchObject({
      status: "available",
      request: { seriesId },
      observations: [{ seriesId, rawValue: "123.45" }],
    });
  });

  it("seals only retrievals at or before the later evidence cutoff", async () => {
    // Given
    const adapter = createBlsAdapter({
      dataRoot: await createBlsTestRoot(),
      transport: async () => ({
        status: 200,
        headers: {},
        body: blsPayload(),
      }),
      clock: { isoNow: () => BLS_TEST_NOW, sleep: async () => undefined },
    });
    const collected = await adapter.collect({
      seriesId: "CUUR0000SA0",
      startYear: 2026,
      endYear: 2026,
    });

    // When
    const valid = sealBlsCollection(collected, "2026-07-22T04:05:07.000Z");
    const future = sealBlsCollection(collected, "2026-07-22T04:05:05.000Z");

    // Then
    expect(valid).toMatchObject({
      status: "sealed",
      evidenceCutoffAt: "2026-07-22T04:05:07.000Z",
    });
    expect(future).toEqual({
      status: "degraded",
      reason: "retrieved_after_cutoff",
    });
  });

  registerBlsPersistenceTestCases();
});
