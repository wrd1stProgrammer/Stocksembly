import { expect, it, vi } from "vitest";
import type { PeersDataset } from "../server/data/insightsentry/insightSentryResearchContracts";
import { resolvePeerIssuerIdentities } from "./insightSentryInitialCollection";

const peers = Array.from({ length: 9 }, (_, index) => ({
  symbol: `NASDAQ:P${index + 1}`,
  name: `Peer ${index + 1}`,
  sector: "Semiconductors",
  classification: "direct_competitor" as const,
  selectionScore: 1 - index / 10,
  selectionReasons: [
    "issuer filing names the company near competition language",
  ],
  marketOverlapVerified: true,
  priceEarningsTtm: 20 + index,
}));
const firstPeer = peers[0];
if (firstPeer === undefined) throw new TypeError("peer fixture missing");

it("resolves the top eight unique peers once and seals canonical qualifications", async () => {
  const resolver = vi.fn(async (ticker: string) => ({
    status: "eligible" as const,
    canonicalTicker: ticker.replace(/^.*:/u, ""),
    identity: {
      cik: ticker.endsWith("P2") ? "cik-P1" : `cik-${ticker}`,
      ticker: ticker.replace(/^.*:/u, ""),
      legalName: `${ticker} Corporation`,
      exchange: "NASDAQ" as const,
      title: "Common Stock",
      securityClass: "common_stock" as const,
    },
    evidence: { identityHash: `hash-${ticker}` },
  }));
  const dataset: PeersDataset = {
    providerUpdatedAt: "2026-08-28T00:00:00.000Z",
    retrievedAt: "2026-08-28T00:00:00.000Z",
    symbol: "NASDAQ:SUBJ",
    sector: "Semiconductors",
    selectorVersion: "fixture",
    selectionCache: "miss",
    subject: {
      symbol: "NASDAQ:SUBJ",
      name: "Subject",
      sector: "Semiconductors",
      priceEarningsTtm: 30,
    },
    relativeValuation: [
      { metric: "price_earnings_ttm", peerMedian: 24, peerCount: 8 },
    ],
    peers: [...peers, firstPeer, { ...firstPeer, symbol: "P1" }],
  };

  const sealed = await resolvePeerIssuerIdentities({ dataset, resolver });

  expect(resolver).toHaveBeenCalledTimes(8);
  expect(new Set(resolver.mock.calls.map(([ticker]) => ticker))).toHaveProperty(
    "size",
    8,
  );
  expect(sealed.peers).toHaveLength(7);
  expect(sealed.relativeValuation).toEqual([]);
  expect(sealed.peers[0]).toMatchObject({
    canonicalIdentity: {
      ticker: "P1",
      securityClass: "common_stock",
      sector: "Semiconductors",
    },
    securityQualification: {
      status: "eligible",
      sourcePurpose: "issuer_identity",
    },
    businessQualification: {
      status: "eligible",
      sourcePurpose: "business_overlap",
    },
    valuationQualification: {
      status: "eligible",
      sourcePurpose: "valuation_metric",
    },
  });
  expect(Object.isFrozen(sealed.peers[0])).toBe(true);
});
