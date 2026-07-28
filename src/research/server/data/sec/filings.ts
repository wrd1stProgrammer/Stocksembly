import { z } from "zod";
import { BYTES } from "../../../domain/limits.constants";
import { normalizeFilingHtml } from "./filingHtml";
import {
  parseHistoricalSubmission,
  parseMainSubmission,
} from "./filingsPayload";
import { selectFilingChain } from "./filingsSelection";
import { SecClientError } from "./secClientErrors";
import type { SecClient, SecFetchResult } from "./secClientTypes";

export { normalizeFilingHtml } from "./filingHtml";

const CollectionInputSchema = z
  .object({
    cik: z.string().regex(/^\d{10}$/),
    cutoffAt: z.iso.datetime({ offset: true }),
    maxNormalizedBytes: z.number().int().positive().optional(),
  })
  .strict();

export type CollectedFiling = {
  readonly accessionNumber: string;
  readonly primaryDocument: string;
  readonly acceptedAt: string;
  readonly filedAt: string;
  readonly form: string;
  readonly period: string;
  readonly sourceUrl: string;
  readonly sourceHash: string;
  readonly retrievedAt: string;
  readonly parentAccessionNumber?: string;
  readonly normalizedText: string;
  readonly normalizedByteLength: number;
  readonly truncated: false;
};

export type FilingCollection =
  | {
      readonly kind: "collected";
      readonly filings: readonly CollectedFiling[];
      readonly historyFileCount: number;
    }
  | {
      readonly kind: "incomplete";
      readonly reason:
        | "missing_10_k"
        | "missing_filing_document"
        | "post_cutoff_source";
    }
  | {
      readonly kind: "invalid_source";
      readonly reason:
        | "malformed_submissions"
        | "malformed_html"
        | "normalized_too_large";
    }
  | { readonly kind: "invalid_input" };

async function loadDocument(
  client: SecClient,
  request: {
    readonly cik: string;
    readonly cutoffAt: string;
    readonly maxNormalizedBytes: number;
    readonly filing: NonNullable<ReturnType<typeof selectFilingChain>>[number];
  },
): Promise<CollectedFiling | FilingCollection> {
  let source: SecFetchResult;
  try {
    source = await client.fetch({
      kind: "filing_document",
      cik: request.cik,
      accessionNumber: request.filing.accessionNumber,
      primaryDocument: request.filing.primaryDocument,
    });
  } catch (error) {
    if (error instanceof SecClientError && error.code === "SEC_HTTP_STATUS")
      return { kind: "incomplete", reason: "missing_filing_document" };
    throw error;
  }
  if (
    source.provenance.retrievedAt >
    new Date(Date.parse(request.cutoffAt)).toISOString()
  )
    return { kind: "incomplete", reason: "post_cutoff_source" };
  const normalized = normalizeFilingHtml(
    source.bytes,
    request.maxNormalizedBytes,
  );
  switch (normalized.kind) {
    case "malformed_html":
      return { kind: "invalid_source", reason: "malformed_html" };
    case "normalized_too_large":
      return { kind: "invalid_source", reason: "normalized_too_large" };
    case "normalized":
      return Object.freeze({
        ...request.filing,
        sourceUrl: source.provenance.sourceUrl,
        sourceHash: source.provenance.contentHash,
        retrievedAt: source.provenance.retrievedAt,
        normalizedText: normalized.text,
        normalizedByteLength: normalized.byteLength,
        truncated: normalized.truncated,
      });
  }
}

export async function collectSecFilings(
  client: SecClient,
  untrustedInput: unknown,
): Promise<FilingCollection> {
  const input = CollectionInputSchema.safeParse(untrustedInput);
  if (!input.success) return { kind: "invalid_input" };
  const submissionSource = await client.fetch({
    kind: "submissions",
    cik: input.data.cik,
  });
  if (
    submissionSource.provenance.retrievedAt >
    new Date(Date.parse(input.data.cutoffAt)).toISOString()
  )
    return { kind: "incomplete", reason: "post_cutoff_source" };
  const submission = parseMainSubmission(
    submissionSource.bytes,
    input.data.cik,
  );
  if (submission.kind === "malformed_source")
    return { kind: "invalid_source", reason: "malformed_submissions" };
  const historicalRecords = [];
  for (const filename of submission.value.historyFiles) {
    const source = await client.fetch({ kind: "submissions_file", filename });
    if (
      source.provenance.retrievedAt >
      new Date(Date.parse(input.data.cutoffAt)).toISOString()
    )
      return { kind: "incomplete", reason: "post_cutoff_source" };
    const history = parseHistoricalSubmission(source.bytes);
    if (history.kind === "malformed_source")
      return { kind: "invalid_source", reason: "malformed_submissions" };
    historicalRecords.push(...history.value);
  }
  const selected = selectFilingChain(
    [...submission.value.records, ...historicalRecords],
    input.data.cutoffAt,
  );
  if (selected === undefined)
    return { kind: "incomplete", reason: "missing_10_k" };
  const filings: CollectedFiling[] = [];
  for (const filing of selected) {
    const loaded = await loadDocument(client, {
      cik: input.data.cik,
      cutoffAt: input.data.cutoffAt,
      maxNormalizedBytes:
        input.data.maxNormalizedBytes ?? BYTES.maxNormalizedFiling,
      filing,
    });
    if ("kind" in loaded) return loaded;
    filings.push(loaded);
  }
  return Object.freeze({
    kind: "collected",
    filings: Object.freeze(filings),
    historyFileCount: submission.value.historyFiles.length,
  });
}
