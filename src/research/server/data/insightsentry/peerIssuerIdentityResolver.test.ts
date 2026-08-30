import { describe, expect, it, vi } from "vitest";
import { createPeerIssuerIdentityResolver } from "./peerIssuerIdentityResolver";

const admitted = (ticker: string, cik = `cik-${ticker}`) => ({
  kind: "admitted" as const,
  identity: {
    cik,
    ticker,
    legalName: `${ticker} Corporation`,
    exchange: "NASDAQ" as const,
    title: "Common Stock",
    securityClass: "common_stock" as const,
  },
  evidence: {
    identityHash: `hash-${ticker}`,
    tickerReferenceHash: "ticker-reference",
    submissionsHash: "submissions",
    historyHashes: [],
    retrievedAt: "2026-08-28T00:00:00.000Z",
  },
});

describe("createPeerIssuerIdentityResolver", () => {
  it("canonicalizes aliases and resolves one promise per ticker per run", async () => {
    const client = { fetch: vi.fn() };
    const createClient = vi.fn(() => client);
    const resolveIssuer = vi.fn(async (_client: object, input: unknown) => {
      if (typeof input !== "object" || input === null)
        throw new TypeError("resolver input missing");
      const ticker = Reflect.get(input, "ticker");
      if (typeof ticker !== "string") throw new TypeError("ticker missing");
      return admitted(ticker);
    });
    const resolver = createPeerIssuerIdentityResolver({
      dataRoot: "/tmp/peer-identity-test",
      cutoffAt: "2026-08-28T00:00:00.000Z",
      createClient,
      resolveIssuer,
    });

    const [first, duplicate, alias] = await Promise.all([
      resolver("NASDAQ:amd"),
      resolver("AMD"),
      resolver(" nasdaq:AMD "),
    ]);

    expect(first).toEqual(duplicate);
    expect(first).toEqual(alias);
    expect(first).toMatchObject({
      status: "eligible",
      canonicalTicker: "AMD",
      identity: { cik: "cik-AMD", securityClass: "common_stock" },
    });
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(resolveIssuer).toHaveBeenCalledTimes(1);
    await expect(resolver("not a ticker")).resolves.toMatchObject({
      status: "not_eligible",
      reason: "invalid_ticker",
    });
    expect(resolveIssuer).toHaveBeenCalledTimes(1);
  });

  it("caches a rejected promise but isolates the cache between runs", async () => {
    const rejected = vi
      .fn()
      .mockRejectedValueOnce(new Error("resolver unavailable"))
      .mockResolvedValueOnce(admitted("AMD"));
    const options = {
      dataRoot: "/tmp/peer-identity-test",
      cutoffAt: "2026-08-28T00:00:00.000Z",
      createClient: vi.fn(() => ({ fetch: vi.fn() })),
      resolveIssuer: rejected,
    };
    const firstRun = createPeerIssuerIdentityResolver(options);

    await expect(firstRun("AMD")).resolves.toMatchObject({
      status: "not_eligible",
      reason: "resolution_failed",
    });
    await expect(firstRun("NASDAQ:AMD")).resolves.toMatchObject({
      status: "not_eligible",
      reason: "resolution_failed",
    });
    expect(rejected).toHaveBeenCalledTimes(1);

    const secondRun = createPeerIssuerIdentityResolver(options);
    await expect(secondRun("AMD")).resolves.toMatchObject({
      status: "eligible",
    });
    expect(rejected).toHaveBeenCalledTimes(2);
  });
});
