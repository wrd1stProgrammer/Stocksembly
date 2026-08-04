import { describe, expect, it } from "vitest";
import type { SecClient, SecFetchResult } from "../server/data/sec/secClient";
import {
  collectSecEvidenceBatch,
  observeCollectionBranch,
  ownershipDataset,
  selectPrimaryCompanyFiling,
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
  it("uses the latest 8-K as a safe primary filing for a newly listed company without a 10-K", () => {
    const filings = [
      {
        accessionNumber: "0001628280-26-045763",
        form: "8-K",
        filedAt: "2026-06-26T00:00:00.000Z",
        acceptedAt: "2026-06-26T20:14:27.000Z",
        period: "2026-06-26",
        primaryDocument: "closing.htm",
      },
      {
        accessionNumber: "0001628280-26-036964",
        form: "S-1",
        filedAt: "2026-05-20T00:00:00.000Z",
        acceptedAt: "2026-05-20T21:07:51.000Z",
        period: "2026-05-20",
        primaryDocument: "registration.htm",
      },
    ];

    expect(selectPrimaryCompanyFiling(filings)?.form).toBe("8-K");
    expect(
      selectPrimaryCompanyFiling([
        ...filings,
        {
          ...filings[0]!,
          accessionNumber: "0001628280-27-000001",
          form: "10-K",
          acceptedAt: "2027-03-01T20:00:00.000Z",
        },
      ])?.form,
    ).toBe("10-K");
  });

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

  it("fetches ownership documents from the reporting filer's accession CIK", async () => {
    const requests: unknown[] = [];
    const client: Pick<SecClient, "fetch"> = {
      fetch: async (request) => {
        requests.push(request);
        if (
          typeof request === "object" &&
          request !== null &&
          "kind" in request &&
          request.kind === "filing_document" &&
          "cik" in request &&
          request.cik === "0001045810"
        ) {
          const error = new Error("not found");
          Object.assign(error, { code: "SEC_HTTP_STATUS", status: 404 });
          throw error;
        }
        return result(
          typeof request === "object" &&
            request !== null &&
            "kind" in request &&
            request.kind === "company_facts"
            ? "company_facts"
            : "filing_document",
        );
      },
    };

    await collectSecEvidenceBatch({
      client,
      cik: "0001045810",
      filings: [
        {
          accessionNumber: "0000315066-24-002826",
          form: "SC 13G/A",
          primaryDocument: "filing.txt",
        },
      ],
    });

    expect(requests).toContainEqual({
      kind: "filing_document",
      cik: "0001045810",
      accessionNumber: "0000315066-24-002826",
      primaryDocument: "filing.txt",
    });
    expect(requests).toContainEqual({
      kind: "filing_document",
      cik: "0000315066",
      accessionNumber: "0000315066-24-002826",
      primaryDocument: "filing.txt",
    });
    expect(requests).toContainEqual({
      kind: "company_facts",
      cik: "0001045810",
    });
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

  it("separates beneficial-owner filings about the issuer from the issuer's own investment filings", () => {
    expect(
      ownershipDataset("SC 13G/A", "0000315066-24-002826", "0001045810"),
    ).toBe("sec_institutional_holdings");
    expect(
      ownershipDataset("SCHEDULE 13G", "0001045810-26-000062", "0001045810"),
    ).toBe("sec_filing");
    expect(
      ownershipDataset("13F-HR", "0001045810-26-000001", "0001045810"),
    ).toBe("sec_filing");
  });

  it("normalizes structured Schedule 13G beneficial ownership", () => {
    const xml = `<sch:edgarSubmission xmlns:sch="urn:schedule13g">
      <sch:coverPageHeader>
        <sch:securitiesClassTitle>Common Stock</sch:securitiesClassTitle>
        <sch:eventDateRequiresFilingThisStatement>07/13/2026</sch:eventDateRequiresFilingThisStatement>
        <sch:issuerInfo>
          <sch:issuerCik>0001045810</sch:issuerCik>
          <sch:issuerName>NVIDIA Corporation</sch:issuerName>
          <sch:issuerCusipNumber>67066G104</sch:issuerCusipNumber>
        </sch:issuerInfo>
      </sch:coverPageHeader>
      <sch:coverPageHeaderReportingPersonDetails>
        <sch:reportingPersonName>Example Asset Manager</sch:reportingPersonName>
        <sch:reportingPersonBeneficiallyOwnedAggregateNumberOfShares>123456</sch:reportingPersonBeneficiallyOwnedAggregateNumberOfShares>
        <sch:classPercent>5.4</sch:classPercent>
        <sch:typeOfReportingPerson>IA</sch:typeOfReportingPerson>
      </sch:coverPageHeaderReportingPersonDetails>
    </sch:edgarSubmission>`;

    expect(
      structuredOwnershipFiling("SCHEDULE 13G", new TextEncoder().encode(xml)),
    ).toEqual({
      kind: "beneficial_ownership",
      issuer: "NVIDIA Corporation",
      issuerCik: "0001045810",
      securityClass: "Common Stock",
      cusip: "67066G104",
      eventDate: "07/13/2026",
      reportingPersons: [
        {
          name: "Example Asset Manager",
          type: "IA",
          shares: "123456",
          classPercent: "5.4",
          soleVotingPower: undefined,
          sharedVotingPower: undefined,
          soleDispositivePower: undefined,
          sharedDispositivePower: undefined,
          comments: undefined,
        },
      ],
    });
  });
});
