import { describe, expect, it } from "vitest";
import { collectSecFilings, normalizeFilingHtml } from "./filings";
import {
  filingColumns,
  filingHtml,
  fixtureClient,
  submissions,
} from "./issuerResolver.testSupport";

const cik = "0001045810";
const records = [
  {
    accession: "0001045810-23-000100",
    form: "10-K",
    filed: "2023-02-20",
    accepted: "20230220160000",
    period: "2022-12-31",
  },
  {
    accession: "0001045810-24-000100",
    form: "10-K",
    filed: "2024-02-20",
    accepted: "20240220160000",
    period: "2023-12-31",
  },
  {
    accession: "0001045810-24-000101",
    form: "10-K/A",
    filed: "2024-03-01",
    accepted: "20240301160000",
    period: "2023-12-31",
  },
  {
    accession: "0001045810-24-000102",
    form: "10-Q",
    filed: "2024-05-20",
    accepted: "20240520160000",
    period: "2024-03-31",
  },
  {
    accession: "0001045810-24-000103",
    form: "10-Q/A",
    filed: "2024-05-27",
    accepted: "20240527160000",
    period: "2024-03-31",
  },
  {
    accession: "0001045810-24-000104",
    form: "8-K",
    filed: "2024-06-01",
    accepted: "20240601160000",
    period: "2024-06-01",
  },
  {
    accession: "0001045810-25-000105",
    form: "10-Q",
    filed: "2025-01-02",
    accepted: "20250102160000",
    period: "2024-09-30",
  },
] as const;

const documents = Object.fromEntries(
  records
    .slice(1, 6)
    .map((record) => [
      `document:${record.accession}`,
      { body: filingHtml(record.form) },
    ]),
);

describe("collectSecFilings", () => {
  it("collects an ordered latest 10-K, subsequent filings, and parented amendments before cutoff", async () => {
    const client = fixtureClient({
      "submissions:0001045810": { body: submissions({ records }) },
      ...documents,
    });

    const result = await collectSecFilings(client, {
      cik,
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result.kind).toBe("collected");
    if (result.kind === "collected") {
      expect(result.filings.map((filing) => filing.form)).toEqual([
        "10-K",
        "10-K/A",
        "10-Q",
        "10-Q/A",
        "8-K",
      ]);
      expect(result.filings[1]?.parentAccessionNumber).toBe(
        "0001045810-24-000100",
      );
      expect(result.filings[3]?.parentAccessionNumber).toBe(
        "0001045810-24-000102",
      );
      expect(
        result.filings.every(
          (filing) => filing.acceptedAt <= "2024-12-31T23:59:59.000Z",
        ),
      ).toBe(true);
      expect(result.filings[0]).toMatchObject({
        truncated: false,
        sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
    }
  });

  it("loads paginated historical submission files before selecting the latest 10-K", async () => {
    const historical = records.slice(0, 2);
    const current = records.slice(2);
    const client = fixtureClient({
      "submissions:0001045810": {
        body: submissions({
          records: current,
          files: ["CIK0001045810-submissions-001.json"],
        }),
      },
      "history:CIK0001045810-submissions-001.json": {
        body: JSON.stringify(filingColumns(historical)),
      },
      ...documents,
    });

    const result = await collectSecFilings(client, {
      cik,
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result.kind).toBe("collected");
    if (result.kind === "collected") expect(result.historyFileCount).toBe(1);
  });

  it("returns incomplete when no cutoff-valid 10-K exists", async () => {
    const futureOnly = [
      {
        accession: "0001045810-25-000100",
        form: "10-K",
        filed: "2025-02-20",
        accepted: "20250220160000",
        period: "2024-12-31",
      },
    ] as const;
    const client = fixtureClient({
      "submissions:0001045810": { body: submissions({ records: futureOnly }) },
    });

    const result = await collectSecFilings(client, {
      cik,
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result).toMatchObject({
      kind: "incomplete",
      reason: "missing_10_k",
    });
  });

  it("returns incomplete when an allowlisted filing document is missing", async () => {
    const client = fixtureClient({
      "submissions:0001045810": {
        body: submissions({ records: records.slice(1, 2) }),
      },
    });

    const result = await collectSecFilings(client, {
      cik,
      cutoffAt: "2024-12-31T23:59:59Z",
    });

    expect(result).toMatchObject({
      kind: "incomplete",
      reason: "missing_filing_document",
    });
  });
});

describe("normalizeFilingHtml", () => {
  it("removes executable, form, and hidden content", () => {
    const result = normalizeFilingHtml(
      Buffer.from(filingHtml("Visible disclosure")),
      1_000,
    );

    expect(result).toEqual({
      kind: "normalized",
      text: "Visible disclosure",
      byteLength: 18,
      truncated: false,
    });
  });

  it("returns typed malformed and size outcomes", () => {
    const malformed = normalizeFilingHtml(Uint8Array.from([0xc3, 0x28]), 1_000);
    const oversized = normalizeFilingHtml(
      Buffer.from(filingHtml("x".repeat(32))),
      16,
    );

    expect(malformed).toMatchObject({ kind: "malformed_html" });
    expect(oversized).toMatchObject({
      kind: "normalized_too_large",
      limitBytes: 16,
      truncated: true,
    });
  });
});
