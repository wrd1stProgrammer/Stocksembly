import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createTreasuryYieldAdapter,
  type MacroHttpTransport,
  sealTreasuryCollection,
  treasuryYieldSourceUrl,
} from "./treasuryYield";

const now = "2026-07-22T04:05:06.000Z";
const header =
  'Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"';
const csv = `${header}\n07/20/2026,4.31,4.30,4.29,4.28,4.27,4.26,4.15,3.92,3.88,3.95,4.07,4.18,4.68,4.71\n`;

describe("Treasury daily par-yield CSV adapter", () => {
  it("uses only the fixed endpoint and preserves dates, tenors, values, hash, and unavailable publication time", async () => {
    // Given
    const requests: {
      readonly url: string;
      readonly timeoutMilliseconds: number;
    }[] = [];
    const transport: MacroHttpTransport = async (request) => {
      requests.push({
        url: request.url,
        timeoutMilliseconds: request.timeoutMilliseconds,
      });
      return {
        status: 200,
        headers: { "content-type": "text/csv; charset=UTF-8" },
        body: csv,
      };
    };
    const adapter = createTreasuryYieldAdapter({
      transport,
      clock: { isoNow: () => now, sleep: async () => undefined },
    });

    // When
    const result = await adapter.collect({ year: 2026 });

    // Then
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(requests).toEqual([
      { url: treasuryYieldSourceUrl(2026), timeoutMilliseconds: 60_000 },
    ]);
    expect(result.releaseTime).toEqual({ availability: "unavailable" });
    expect(result.curve[0]).toEqual({
      observationDate: "2026-07-20",
      tenors: {
        "1 Mo": "4.31",
        "1.5 Month": "4.30",
        "2 Mo": "4.29",
        "3 Mo": "4.28",
        "4 Mo": "4.27",
        "6 Mo": "4.26",
        "1 Yr": "4.15",
        "2 Yr": "3.92",
        "3 Yr": "3.88",
        "5 Yr": "3.95",
        "7 Yr": "4.07",
        "10 Yr": "4.18",
        "20 Yr": "4.68",
        "30 Yr": "4.71",
      },
    });
    expect(result.provenance).toEqual({
      sourceUrl: treasuryYieldSourceUrl(2026),
      retrievedAt: now,
      contentHash: createHash("sha256").update(csv).digest("hex"),
      freshness: "fresh",
    });
  });

  it("keeps acquisition open through a slow final response and enforces cutoff sealing", async () => {
    // Given
    const times = ["2026-07-22T04:05:00.000Z", "2026-07-22T04:05:06.000Z"];
    const transport: MacroHttpTransport = async () => ({
      status: 200,
      headers: {},
      body: csv,
    });
    const adapter = createTreasuryYieldAdapter({
      transport,
      clock: {
        isoNow: () => times.shift() ?? now,
        sleep: async () => undefined,
      },
    });

    // When
    const collected = await adapter.collect({ year: 2026 });
    const valid = sealTreasuryCollection(collected, "2026-07-22T04:05:07.000Z");
    const future = sealTreasuryCollection(
      collected,
      "2026-07-22T04:05:05.000Z",
    );

    // Then
    expect(collected).toMatchObject({
      status: "available",
      provenance: { retrievedAt: "2026-07-22T04:05:06.000Z" },
    });
    expect(valid).toMatchObject({ status: "sealed" });
    expect(future).toEqual({
      status: "degraded",
      reason: "retrieved_after_cutoff",
    });
  });

  it("degrades on exact CSV header drift without inferring values", async () => {
    // Given
    const changed = csv.replace("10 Yr", "10 Year");
    const adapter = createTreasuryYieldAdapter({
      transport: async () => ({ status: 200, headers: {}, body: changed }),
      clock: { isoNow: () => now, sleep: async () => undefined },
    });

    // When
    const result = await adapter.collect({ year: 2026 });

    // Then
    expect(result).toEqual({
      status: "degraded",
      reason: "schema_drift",
      expectedHeader: header,
      receivedHeader: header.replace("10 Yr", "10 Year"),
    });
  });

  it("maps stale or missing curve data to optional degradation", async () => {
    // Given
    const stale = `${header}\n01/02/2025,4.31,4.30,4.29,4.28,4.27,4.26,4.15,3.92,3.88,3.95,4.07,4.18,4.68,4.71\n`;
    const empty = `${header}\n`;
    const transportFor =
      (body: string): MacroHttpTransport =>
      async () => ({ status: 200, headers: {}, body });

    // When
    const staleResult = await createTreasuryYieldAdapter({
      transport: transportFor(stale),
      clock: { isoNow: () => now, sleep: async () => undefined },
    }).collect({ year: 2026 });
    const emptyResult = await createTreasuryYieldAdapter({
      transport: transportFor(empty),
      clock: { isoNow: () => now, sleep: async () => undefined },
    }).collect({ year: 2026 });

    // Then
    expect(staleResult).toMatchObject({
      status: "degraded",
      reason: "stale_data",
      latestObservationDate: "2025-01-02",
    });
    expect(emptyResult).toEqual({
      status: "degraded",
      reason: "data_unavailable",
    });
  });

  it("retries bounded transient server responses", async () => {
    // Given
    let attempts = 0;
    const delays: number[] = [];
    const adapter = createTreasuryYieldAdapter({
      transport: async () => {
        attempts += 1;
        return attempts < 3
          ? { status: 503, headers: {}, body: "busy" }
          : { status: 200, headers: {}, body: csv };
      },
      clock: {
        isoNow: () => now,
        sleep: async (milliseconds) => {
          delays.push(milliseconds);
        },
      },
    });

    // When
    const result = await adapter.collect({ year: 2026 });

    // Then
    expect(result.status).toBe("available");
    expect(attempts).toBe(3);
    expect(delays).toEqual([250, 500]);
  });
});
