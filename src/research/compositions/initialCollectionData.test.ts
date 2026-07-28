import { describe, expect, it } from "vitest";
import type { SecClient, SecFetchResult } from "../server/data/sec/secClient";
import { collectSecEvidenceBatch } from "./initialCollectionData";

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
        const typed = request as { readonly kind: string };
        if (typed.kind === "filing_document") {
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
});
