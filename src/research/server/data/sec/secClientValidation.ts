import { z } from "zod";
import { SecClientError } from "./secClientErrors";
import type { SecRequest } from "./secClientRequest";
import type { SecWireResponse } from "./secClientTypes";

const RecentFilingsSchema = z
  .object({
    accessionNumber: z.array(z.string()),
    form: z.array(z.string()),
    filingDate: z.array(z.string()),
    primaryDocument: z.array(z.string()),
  })
  .passthrough();

const ResponseCikSchema = z.union([
  z.string().regex(/^\d{1,10}$/),
  z.number().int().min(0).max(9_999_999_999),
]);

const SubmissionsSchema = z
  .object({
    cik: ResponseCikSchema,
    name: z.string().min(1),
    filings: z
      .object({
        recent: RecentFilingsSchema,
        files: z.array(
          z
            .object({
              name: z.string().min(1),
              filingCount: z.number().int().nonnegative().optional(),
              filingFrom: z.string().optional(),
              filingTo: z.string().optional(),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

const CompanyFactsSchema = z
  .object({
    cik: ResponseCikSchema,
    entityName: z.string().min(1),
    facts: z.record(z.string(), z.record(z.string(), z.unknown())),
  })
  .passthrough();

const HistoricalSubmissionsSchema = RecentFilingsSchema;
const CompanyTickersExchangeSchema = z
  .object({
    fields: z.tuple([
      z.literal("cik"),
      z.literal("name"),
      z.literal("ticker"),
      z.literal("exchange"),
    ]),
    data: z.array(
      z.tuple([
        z.number().int().nonnegative().max(9_999_999_999),
        z.string().min(1),
        z.string().min(1),
        z.string().nullable(),
      ]),
    ),
  })
  .strict();

function mediaType(headers: Readonly<Record<string, string>>): string {
  return (headers["content-type"]?.split(";", 1)[0] ?? "").trim().toLowerCase();
}

function isJsonMediaType(value: string): boolean {
  return value === "application/json" || value.endsWith("+json");
}

function validateAlignedRecentFilings(
  value: z.infer<typeof RecentFilingsSchema>,
): void {
  const lengths = new Set([
    value.accessionNumber.length,
    value.form.length,
    value.filingDate.length,
    value.primaryDocument.length,
  ]);
  if (lengths.size !== 1) throw new SecClientError("SEC_SCHEMA_INVALID");
}

function validateResponseCik(
  requestCik: string,
  responseCik: string | number,
): void {
  if (String(responseCik).padStart(10, "0") !== requestCik)
    throw new SecClientError("SEC_SCHEMA_INVALID");
}

function validateJson(request: SecRequest, bytes: Uint8Array): void {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new SecClientError("SEC_SCHEMA_INVALID");
    throw error;
  }
  switch (request.kind) {
    case "company_tickers_exchange": {
      const parsed = CompanyTickersExchangeSchema.safeParse(decoded);
      if (!parsed.success) throw new SecClientError("SEC_SCHEMA_INVALID");
      return;
    }
    case "submissions": {
      const parsed = SubmissionsSchema.safeParse(decoded);
      if (!parsed.success) throw new SecClientError("SEC_SCHEMA_INVALID");
      validateResponseCik(request.cik, parsed.data.cik);
      validateAlignedRecentFilings(parsed.data.filings.recent);
      return;
    }
    case "company_facts": {
      const parsed = CompanyFactsSchema.safeParse(decoded);
      if (!parsed.success) throw new SecClientError("SEC_SCHEMA_INVALID");
      validateResponseCik(request.cik, parsed.data.cik);
      return;
    }
    case "submissions_file": {
      const parsed = HistoricalSubmissionsSchema.safeParse(decoded);
      if (!parsed.success) throw new SecClientError("SEC_SCHEMA_INVALID");
      validateAlignedRecentFilings(parsed.data);
      return;
    }
    case "filing_document":
      return;
  }
}

function validateMediaType(request: SecRequest, value: string): void {
  switch (request.kind) {
    case "company_tickers_exchange":
    case "submissions":
    case "company_facts":
    case "submissions_file":
      if (!isJsonMediaType(value))
        throw new SecClientError("SEC_UNEXPECTED_MEDIA_TYPE");
      return;
    case "filing_document":
      if (
        value !== "text/html" &&
        value !== "text/plain" &&
        value !== "application/xml" &&
        value !== "text/xml"
      )
        throw new SecClientError("SEC_UNEXPECTED_MEDIA_TYPE");
      return;
  }
}

function validateDocumentBody(bytes: Uint8Array): void {
  if (bytes.includes(0)) throw new SecClientError("SEC_SCHEMA_INVALID");
  if (Buffer.from(bytes).toString("utf8").trim().length === 0)
    throw new SecClientError("SEC_EMPTY_RESPONSE");
}

export async function readValidatedSecBody(options: {
  readonly request: SecRequest;
  readonly response: SecWireResponse;
  readonly limitBytes: number;
}): Promise<{ readonly bytes: Uint8Array; readonly contentType: string }> {
  const contentType = mediaType(options.response.headers);
  validateMediaType(options.request, contentType);
  const declaredLength = Number(options.response.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > options.limitBytes) {
    options.response.abort();
    throw new SecClientError("SEC_RESPONSE_TOO_LARGE", {
      limitBytes: options.limitBytes,
    });
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of options.response.body) {
    byteLength += chunk.byteLength;
    if (byteLength > options.limitBytes) {
      options.response.abort();
      throw new SecClientError("SEC_RESPONSE_TOO_LARGE", {
        limitBytes: options.limitBytes,
      });
    }
    chunks.push(Uint8Array.from(chunk));
  }
  if (byteLength === 0) throw new SecClientError("SEC_EMPTY_RESPONSE");
  const bytes = Uint8Array.from(
    Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
  );
  switch (options.request.kind) {
    case "company_tickers_exchange":
    case "submissions":
    case "company_facts":
    case "submissions_file":
      validateJson(options.request, bytes);
      break;
    case "filing_document":
      validateDocumentBody(bytes);
      break;
  }
  return Object.freeze({ bytes, contentType });
}
