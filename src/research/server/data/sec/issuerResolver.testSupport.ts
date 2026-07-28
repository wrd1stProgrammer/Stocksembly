import { createHash } from "node:crypto";
import { SecClientError } from "./secClientErrors";
import type { SecRequest } from "./secClientRequest";
import { SecRequestSchema } from "./secClientRequest";
import type { SecClient, SecFetchResult } from "./secClientTypes";

export type FixtureResponse = {
  readonly body: string;
  readonly retrievedAt?: string;
};

export function fixtureClient(
  responses: Readonly<Record<string, FixtureResponse>>,
): SecClient {
  return Object.freeze({
    fetch: async (untrustedRequest: unknown) => {
      const request = SecRequestSchema.parse(untrustedRequest);
      const key = requestKey(request);
      const response = responses[key];
      if (response === undefined)
        throw new SecClientError("SEC_HTTP_STATUS", { status: 404 });
      const bytes = Buffer.from(response.body);
      return Object.freeze({
        request,
        bytes,
        provenance: Object.freeze({
          sourceUrl: `https://www.sec.gov/fixture/${key}`,
          requestedAt: "2025-01-01T00:00:00.000Z",
          retrievedAt: response.retrievedAt ?? "2024-01-01T00:00:01.000Z",
          responseStatus: 200,
          responseHeaders: Object.freeze({}),
          contentHash: createHash("sha256").update(bytes).digest("hex"),
          byteLength: bytes.byteLength,
          identityHash: "a".repeat(64),
          cacheStatus: "miss",
        }),
      }) satisfies SecFetchResult;
    },
  });
}

function requestKey(request: SecRequest): string {
  switch (request.kind) {
    case "company_tickers_exchange":
      return "tickers";
    case "submissions":
      return `submissions:${request.cik}`;
    case "submissions_file":
      return `history:${request.filename}`;
    case "filing_document":
      return `document:${request.accessionNumber}`;
    case "company_facts":
      return `facts:${request.cik}`;
  }
}

export function tickerReference(
  rows: readonly (readonly [number, string, string, string])[],
): string {
  return JSON.stringify({
    fields: ["cik", "name", "ticker", "exchange"],
    data: rows,
  });
}

export function submissions(options: {
  readonly cik?: string;
  readonly name?: string;
  readonly records: readonly FilingFixture[];
  readonly files?: readonly string[];
}): string {
  const recent = filingColumns(options.records);
  return JSON.stringify({
    cik: options.cik ?? "1045810",
    name: options.name ?? "NVIDIA CORP",
    filings: {
      recent,
      files: (options.files ?? []).map((name) => ({ name })),
    },
  });
}

export type FilingFixture = {
  readonly accession: string;
  readonly form: string;
  readonly filed: string;
  readonly accepted: string;
  readonly period: string;
  readonly document?: string;
};

export function filingColumns(records: readonly FilingFixture[]): object {
  return {
    accessionNumber: records.map((record) => record.accession),
    form: records.map((record) => record.form),
    filingDate: records.map((record) => record.filed),
    acceptanceDateTime: records.map((record) => record.accepted),
    reportDate: records.map((record) => record.period),
    primaryDocument: records.map(
      (record) =>
        record.document ?? `${record.accession.replaceAll("-", "")}.htm`,
    ),
  };
}

export function filingHtml(text = "Material filing disclosure"): string {
  return `<html><body><script>secret()</script><style>.x{}</style><form>ignore</form><div hidden>hidden</div><main>${text}</main></body></html>`;
}

export function coverHtml(
  options: {
    readonly ticker?: string;
    readonly exchange?: string;
    readonly title?: string;
  } = {},
): string {
  return `<html><body><ix:nonnumeric name="dei:TradingSymbol" contextref="cover">${options.ticker ?? "NVDA"}</ix:nonnumeric><ix:nonnumeric name="dei:SecurityExchangeName" contextref="cover">${options.exchange ?? "NASDAQ"}</ix:nonnumeric><ix:nonnumeric name="dei:Security12bTitle" contextref="cover">${options.title ?? "Common Stock"}</ix:nonnumeric></body></html>`;
}
