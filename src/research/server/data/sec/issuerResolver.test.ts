import { describe, expect, it } from "vitest";
import { resolveSecIssuer } from "./issuerResolver";
import "./issuerResolverPagination.testCases";
import {
  coverHtml,
  fixtureClient,
  submissions,
  tickerReference,
} from "./issuerResolver.testSupport";

const domesticRecords = [
  {
    accession: "0001045810-24-000029",
    form: "10-K",
    filed: "2024-02-21",
    accepted: "20240221163000",
    period: "2024-01-28",
  },
  {
    accession: "0001045810-24-000111",
    form: "10-Q",
    filed: "2024-05-29",
    accepted: "20240529163000",
    period: "2024-04-28",
  },
  {
    accession: "0001045810-24-000222",
    form: "8-K",
    filed: "2024-06-03",
    accepted: "20240603120000",
    period: "2024-06-03",
  },
] as const;

describe("resolveSecIssuer", () => {
  it("admits an exact uppercase domestic operating-company ticker", async () => {
    const client = fixtureClient({
      tickers: {
        body: tickerReference([[1045810, "NVIDIA CORP", "NVDA", "Nasdaq"]]),
      },
      "submissions:0001045810": {
        body: submissions({ records: domesticRecords }),
      },
      "document:0001045810-24-000029": { body: coverHtml() },
    });

    const result = await resolveSecIssuer(client, {
      ticker: "NVDA",
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result.kind).toBe("admitted");
    if (result.kind === "admitted") {
      expect(result.identity).toMatchObject({
        cik: "0001045810",
        ticker: "NVDA",
        legalName: "NVIDIA CORP",
        exchange: "NASDAQ",
      });
      expect(result.evidence.identityHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("resolves one class exactly when the same issuer has multiple classes", async () => {
    const client = fixtureClient({
      tickers: {
        body: tickerReference([
          [1045810, "NVIDIA CORP", "NVDA", "Nasdaq"],
          [1045810, "NVIDIA CORP", "NVDB", "Nasdaq"],
        ]),
      },
      "submissions:0001045810": {
        body: submissions({ records: domesticRecords }),
      },
      "document:0001045810-24-000029": { body: coverHtml() },
    });

    const result = await resolveSecIssuer(client, {
      ticker: "NVDA",
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result.kind).toBe("admitted");
  });

  it("rejects ambiguous exact ticker mappings", async () => {
    const client = fixtureClient({
      tickers: {
        body: tickerReference([
          [1, "ONE", "DUPE", "NYSE"],
          [2, "TWO", "DUPE", "Nasdaq"],
        ]),
      },
    });

    const result = await resolveSecIssuer(client, {
      ticker: "DUPE",
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result).toMatchObject({
      kind: "rejected",
      reason: "ambiguous_ticker",
    });
  });

  it.each([
    [
      "foreign private issuer",
      [
        {
          accession: "0001045810-24-000001",
          form: "20-F",
          filed: "2024-02-01",
          accepted: "20240201120000",
          period: "2023-12-31",
        },
        {
          accession: "0001045810-24-000002",
          form: "6-K",
          filed: "2024-05-01",
          accepted: "20240501120000",
          period: "2024-05-01",
        },
      ],
      "foreign_private_issuer",
    ],
    [
      "ETF",
      [
        {
          accession: "0001045810-24-000003",
          form: "N-1A",
          filed: "2024-02-01",
          accepted: "20240201120000",
          period: "2023-12-31",
        },
      ],
      "fund",
    ],
  ])(
    "rejects an unsupported %s form hierarchy",
    async (_label, records, reason) => {
      const client = fixtureClient({
        tickers: {
          body: tickerReference([[1045810, "UNSUPPORTED", "NOPE", "Nasdaq"]]),
        },
        "submissions:0001045810": { body: submissions({ records }) },
      });

      const result = await resolveSecIssuer(client, {
        ticker: "NOPE",
        cutoffAt: "2024-12-31T23:59:59Z",
      });

      expect(result).toMatchObject({ kind: "rejected", reason });
    },
  );

  it("rejects OTC and lowercase input without fuzzy matching", async () => {
    const client = fixtureClient({
      tickers: {
        body: tickerReference([[1045810, "NVIDIA CORP", "NVDA", "OTC"]]),
      },
    });

    const otc = await resolveSecIssuer(client, {
      ticker: "NVDA",
      cutoffAt: "2024-12-31T23:59:59Z",
    });
    const lowercase = await resolveSecIssuer(client, {
      ticker: "nvda",
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(otc).toMatchObject({ kind: "rejected", reason: "otc" });
    expect(lowercase).toMatchObject({ kind: "invalid_input" });
  });

  it.each([
    ["American Depositary Shares", "adr"],
    ["Units", "unit"],
    ["Warrants", "warrant"],
    ["Preferred Stock", "preferred"],
  ])("rejects %s from the filing cover triplet", async (title, reason) => {
    const client = fixtureClient({
      tickers: {
        body: tickerReference([[1045810, "NVIDIA CORP", "NVDA", "Nasdaq"]]),
      },
      "submissions:0001045810": {
        body: submissions({ records: domesticRecords }),
      },
      "document:0001045810-24-000029": {
        body: coverHtml({ title }),
      },
    });

    const result = await resolveSecIssuer(client, {
      ticker: "NVDA",
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result).toMatchObject({ kind: "rejected", reason });
  });
});
