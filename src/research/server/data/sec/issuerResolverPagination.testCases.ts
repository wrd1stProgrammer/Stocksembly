import { describe, expect, it } from "vitest";
import { resolveSecIssuer } from "./issuerResolver";
import {
  coverHtml,
  filingColumns,
  fixtureClient,
  submissions,
  tickerReference,
} from "./issuerResolver.testSupport";

const historyFilename = "CIK0001045810-submissions-001.json";
const historyRecords = [
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

function baseResponses() {
  return {
    tickers: {
      body: tickerReference([[1045810, "NVIDIA CORP", "NVDA", "Nasdaq"]]),
    },
    "submissions:0001045810": {
      body: submissions({ records: [], files: [historyFilename] }),
    },
  } as const;
}

describe("resolveSecIssuer historical submissions", () => {
  it("admits when all cutoff-valid domestic forms are paged out of recent", async () => {
    const client = fixtureClient({
      ...baseResponses(),
      [`history:${historyFilename}`]: {
        body: JSON.stringify(filingColumns(historyRecords)),
      },
      "document:0001045810-24-000029": { body: coverHtml() },
    });

    const result = await resolveSecIssuer(client, {
      ticker: "NVDA",
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result.kind).toBe("admitted");
  });

  it("returns typed missing history instead of an incomplete-form false positive", async () => {
    const result = await resolveSecIssuer(fixtureClient(baseResponses()), {
      ticker: "NVDA",
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result).toMatchObject({
      kind: "rejected",
      reason: "missing_history_file",
    });
  });

  it("returns typed malformed history", async () => {
    const client = fixtureClient({
      ...baseResponses(),
      [`history:${historyFilename}`]: { body: JSON.stringify({ form: [] }) },
    });

    const result = await resolveSecIssuer(client, {
      ticker: "NVDA",
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result).toMatchObject({
      kind: "rejected",
      reason: "malformed_source",
    });
  });

  it("rejects conflicting duplicate accessions across recent and history", async () => {
    const conflict = [{ ...historyRecords[0], form: "10-Q" }] as const;
    const client = fixtureClient({
      tickers: baseResponses().tickers,
      "submissions:0001045810": {
        body: submissions({
          records: historyRecords,
          files: [historyFilename],
        }),
      },
      [`history:${historyFilename}`]: {
        body: JSON.stringify(filingColumns(conflict)),
      },
    });

    const result = await resolveSecIssuer(client, {
      ticker: "NVDA",
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result).toMatchObject({
      kind: "rejected",
      reason: "source_disagreement",
    });
  });

  it("rejects a mandatory form with accepted time before but filed date after cutoff", async () => {
    const impossibleRecords = historyRecords.map((record) =>
      record.form === "10-Q"
        ? { ...record, filed: "2025-01-02", accepted: "20241230160000" }
        : record,
    );
    const client = fixtureClient({
      tickers: baseResponses().tickers,
      "submissions:0001045810": {
        body: submissions({ records: impossibleRecords }),
      },
      "document:0001045810-24-000029": { body: coverHtml() },
    });

    const result = await resolveSecIssuer(client, {
      ticker: "NVDA",
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result).toMatchObject({
      kind: "rejected",
      reason: "malformed_source",
    });
  });

  it("rejects a historical submissions filename bound to another CIK", async () => {
    const foreignFilename = "CIK0000320193-submissions-001.json";
    const client = fixtureClient({
      tickers: baseResponses().tickers,
      "submissions:0001045810": {
        body: submissions({ records: [], files: [foreignFilename] }),
      },
      [`history:${foreignFilename}`]: {
        body: JSON.stringify(filingColumns(historyRecords)),
      },
      "document:0001045810-24-000029": { body: coverHtml() },
    });

    const result = await resolveSecIssuer(client, {
      ticker: "NVDA",
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result).toMatchObject({
      kind: "rejected",
      reason: "source_disagreement",
    });
  });

  it("rejects duplicate historical submissions filenames", async () => {
    const client = fixtureClient({
      tickers: baseResponses().tickers,
      "submissions:0001045810": {
        body: submissions({
          records: [],
          files: [historyFilename, historyFilename],
        }),
      },
      [`history:${historyFilename}`]: {
        body: JSON.stringify(filingColumns(historyRecords)),
      },
      "document:0001045810-24-000029": { body: coverHtml() },
    });

    const result = await resolveSecIssuer(client, {
      ticker: "NVDA",
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result).toMatchObject({
      kind: "rejected",
      reason: "source_disagreement",
    });
  });
});
