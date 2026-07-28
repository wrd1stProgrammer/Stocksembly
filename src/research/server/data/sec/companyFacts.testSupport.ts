export const companyFactsContext = {
  cik: "0001045810",
  cutoffAt: "2025-03-01T00:00:00.000Z",
  retrievedAt: "2025-02-20T00:00:00.000Z",
  sourceHash: "a".repeat(64),
  filings: [
    {
      accessionNumber: "0001045810-25-000001",
      form: "10-K",
      filedAt: "2025-02-15T00:00:00.000Z",
      acceptedAt: "2025-02-15T12:00:00.000Z",
      period: "2024-12-31",
    },
    {
      accessionNumber: "0001045810-25-000002",
      parentAccessionNumber: "0001045810-25-000001",
      form: "10-K/A",
      filedAt: "2025-02-18T00:00:00.000Z",
      acceptedAt: "2025-02-18T12:00:00.000Z",
      period: "2024-12-31",
    },
  ],
} as const;

export function companyFactsPayload(): Uint8Array {
  return Buffer.from(
    JSON.stringify({
      cik: 1045810,
      entityName: "NVIDIA CORP",
      facts: {
        "us-gaap": {
          Revenues: {
            label: "Revenue",
            description: "Revenue",
            units: {
              USD: [
                {
                  start: "2024-01-01",
                  end: "2024-12-31",
                  val: "100.10",
                  accn: "0001045810-25-000001",
                  fy: 2024,
                  fp: "FY",
                  form: "10-K",
                  filed: "2025-02-15",
                  frame: "CY2024",
                },
                {
                  start: "2024-01-01",
                  end: "2024-12-31",
                  val: "101.20",
                  accn: "0001045810-25-000002",
                  fy: 2024,
                  fp: "FY",
                  form: "10-K/A",
                  filed: "2025-02-18",
                },
                {
                  start: "2024-01-01",
                  end: "2024-12-31",
                  val: "999",
                  accn: "0001045810-25-000002",
                  fy: 2024,
                  fp: "FY",
                  form: "10-K/A",
                  filed: "2025-02-18",
                  segment: {
                    dimension: "us-gaap:StatementBusinessSegmentsAxis",
                  },
                },
              ],
              shares: [
                {
                  start: "2024-01-01",
                  end: "2024-12-31",
                  val: "10",
                  accn: "0001045810-25-000002",
                  fy: 2024,
                  fp: "FY",
                  form: "10-K/A",
                  filed: "2025-02-18",
                },
              ],
            },
          },
        },
        custom: {
          CloudRevenue: {
            label: "Cloud revenue",
            description: "Custom fact",
            units: { USD: [] },
          },
        },
      },
    }),
  );
}
