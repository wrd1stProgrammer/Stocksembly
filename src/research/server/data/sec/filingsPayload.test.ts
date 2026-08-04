import { describe, expect, it } from "vitest";
import { parseMainSubmission } from "./filingsPayload";

describe("SEC submissions registration filing dates", () => {
  it("retains S-1 and 424B4 records whose SEC reportDate is blank", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        cik: "0001181412",
        name: "SPACE EXPLORATION TECHNOLOGIES CORP",
        filings: {
          recent: {
            accessionNumber: ["0001628280-26-036964", "0001628280-26-042639"],
            form: ["S-1", "424B4"],
            filingDate: ["2026-05-20", "2026-06-12"],
            acceptanceDateTime: [
              "2026-05-20T21:07:51.000Z",
              "2026-06-12T10:04:16.000Z",
            ],
            reportDate: ["", ""],
            primaryDocument: ["registration.htm", "prospectus.htm"],
          },
          files: [],
        },
      }),
    );

    const parsed = parseMainSubmission(bytes, "0001181412");

    expect(parsed.kind).toBe("parsed");
    if (parsed.kind === "parsed")
      expect(parsed.value.records).toEqual([
        expect.objectContaining({ form: "S-1", period: "2026-05-20" }),
        expect.objectContaining({ form: "424B4", period: "2026-06-12" }),
      ]);
  });

  it("keeps usable COKE filings when legacy SEC rows have no primary document", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        cik: "0000317540",
        name: "Coca-Cola Consolidated, Inc.",
        filings: {
          recent: {
            accessionNumber: ["0000317540-26-000001", "0000317540-01-000001"],
            form: ["10-Q", "4"],
            filingDate: ["2026-05-01", "2001-01-02"],
            acceptanceDateTime: [
              "2026-05-01T12:00:00.000Z",
              "2001-01-02T12:00:00.000Z",
            ],
            reportDate: ["2026-03-31", "2001-01-02"],
            primaryDocument: ["coke-20260331.htm", ""],
          },
          files: [],
        },
      }),
    );

    const parsed = parseMainSubmission(bytes, "0000317540");

    expect(parsed).toEqual({
      kind: "parsed",
      value: {
        name: "Coca-Cola Consolidated, Inc.",
        records: [
          expect.objectContaining({
            accessionNumber: "0000317540-26-000001",
            primaryDocument: "coke-20260331.htm",
          }),
        ],
        historyFiles: [],
      },
    });
  });
});
