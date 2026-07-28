import { z } from "zod";

const CikSchema = z.string().regex(/^\d{10}$/);
const AccessionNumberSchema = z.string().regex(/^\d{10}-\d{2}-\d{6}$/);
const FilingDocumentSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:htm|html|txt)$/i);
const SubmissionsFileSchema = z
  .string()
  .regex(/^CIK\d{10}-submissions-\d{3}\.json$/);

export const SecRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("company_tickers_exchange") }).strict(),
  z.object({ kind: z.literal("submissions"), cik: CikSchema }).strict(),
  z.object({ kind: z.literal("company_facts"), cik: CikSchema }).strict(),
  z
    .object({
      kind: z.literal("submissions_file"),
      filename: SubmissionsFileSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("filing_document"),
      cik: CikSchema,
      accessionNumber: AccessionNumberSchema,
      primaryDocument: FilingDocumentSchema,
    })
    .strict(),
]);
export type SecRequest = z.infer<typeof SecRequestSchema>;

export function buildSecUrl(request: SecRequest): URL {
  switch (request.kind) {
    case "company_tickers_exchange":
      return new URL("https://www.sec.gov/files/company_tickers_exchange.json");
    case "submissions":
      return new URL(`https://data.sec.gov/submissions/CIK${request.cik}.json`);
    case "company_facts":
      return new URL(
        `https://data.sec.gov/api/xbrl/companyfacts/CIK${request.cik}.json`,
      );
    case "submissions_file":
      return new URL(`https://data.sec.gov/submissions/${request.filename}`);
    case "filing_document": {
      const cik = request.cik.replace(/^0+/, "") || "0";
      const accession = request.accessionNumber.replaceAll("-", "");
      return new URL(
        `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${request.primaryDocument}`,
      );
    }
  }
}
