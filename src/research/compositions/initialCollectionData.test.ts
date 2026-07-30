import { describe, expect, it } from "vitest";
import type { SecClient, SecFetchResult } from "../server/data/sec/secClient";
import {
  collectSecEvidenceBatch,
  observeCollectionBranch,
  structuredOwnershipFiling,
} from "./initialCollectionData";

function result(kind: "company_facts" | "filing_document"): SecFetchResult {
  return {
    request:
      kind === "company_facts"
        ? { kind, cik: "0000320193" }
        : {
            kind,
            cik: "0000320193",
            accessionNumber: "0000320193-26-000001",
            primaryDocument: "fixture.htm",
          },
    bytes: new Uint8Array([1]),
    provenance: {
      sourceUrl: "https://www.sec.gov/fixture",
      requestedAt: "2026-07-28T00:00:00.000Z",
      retrievedAt: "2026-07-28T00:00:00.000Z",
      responseStatus: 200,
      responseHeaders: {},
      contentHash: "a".repeat(64),
      byteLength: 1,
      identityHash: "b".repeat(64),
      cacheStatus: "miss",
    },
  };
}

describe("initial collection concurrency", () => {
  it("starts company facts while filing documents are still loading", async () => {
    // Given
    let releaseFiling: () => void = () => undefined;
    const filingGate = new Promise<void>((resolve) => {
      releaseFiling = resolve;
    });
    let filingStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      filingStarted = resolve;
    });
    let factsStarted = false;
    const client: Pick<SecClient, "fetch"> = {
      fetch: async (request) => {
        if (
          typeof request !== "object" ||
          request === null ||
          !("kind" in request)
        )
          throw new TypeError("unexpected SEC request");
        if (request.kind === "filing_document") {
          filingStarted();
          await filingGate;
          return result("filing_document");
        }
        factsStarted = true;
        return result("company_facts");
      },
    };

    // When
    const pending = collectSecEvidenceBatch({
      client,
      cik: "0000320193",
      filings: [
        {
          accessionNumber: "0000320193-26-000001",
          primaryDocument: "fixture.htm",
        },
      ],
    });
    await started;
    await Promise.resolve();
    const factsStartedBeforeFilingCompleted = factsStarted;
    releaseFiling();
    await pending;

    // Then
    expect(factsStartedBeforeFilingCompleted).toBe(true);
  });

  it("observes a background rejection even when another branch fails first", async () => {
    // Given
    const macroFailure = new Error("macro failed");
    const secFailure = new Error("SEC failed");
    const observedMacro = observeCollectionBranch(
      Promise.reject<readonly never[]>(macroFailure),
    );

    // When
    await expect(Promise.reject(secFailure)).rejects.toBe(secFailure);
    const macro = await observedMacro;

    // Then
    expect(macro).toEqual({ status: "rejected", reason: macroFailure });
  });

  it("normalizes Form 4 transactions into decision-ready fields", () => {
    const xml = `<ownershipDocument>
      <issuer><issuerName>NVIDIA CORP</issuerName></issuer>
      <reportingOwner><reportingOwnerId><rptOwnerName>Sample Officer</rptOwnerName></reportingOwnerId></reportingOwner>
      <nonDerivativeTransaction>
        <securityTitle><value>Common Stock</value></securityTitle>
        <transactionDate><value>2026-07-28</value></transactionDate>
        <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
        <transactionAmounts>
          <transactionShares><value>1250</value></transactionShares>
          <transactionPricePerShare><value>178.50</value></transactionPricePerShare>
          <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
        </transactionAmounts>
        <postTransactionAmounts><sharesOwnedFollowingTransaction><value>9000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      </nonDerivativeTransaction>
    </ownershipDocument>`;

    expect(
      structuredOwnershipFiling("4", new TextEncoder().encode(xml)),
    ).toMatchObject({
      kind: "insider_transactions",
      reportingOwner: "Sample Officer",
      issuer: "NVIDIA CORP",
      transactions: [
        {
          security: "Common Stock",
          date: "2026-07-28",
          code: "S",
          shares: "1250",
          pricePerShare: "178.50",
          acquiredOrDisposed: "D",
          sharesOwnedAfter: "9000",
        },
      ],
    });
  });
});
