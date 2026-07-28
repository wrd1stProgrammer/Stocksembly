import {
  type FilingMetadata,
  parseHistoricalSubmission,
  type SubmissionPayload,
} from "./filingsPayload";
import { SecClientError } from "./secClientErrors";
import type { SecClient, SecFetchResult } from "./secClientTypes";

export type ResolverHistoryResult =
  | {
      readonly kind: "merged";
      readonly records: readonly FilingMetadata[];
      readonly contentHashes: readonly string[];
      readonly latestRetrievedAt: string | undefined;
    }
  | {
      readonly kind: "rejected";
      readonly reason:
        | "missing_history_file"
        | "malformed_source"
        | "post_cutoff_source"
        | "source_disagreement";
    };

type ResolverHistoryRequest = {
  readonly submission: SubmissionPayload;
  readonly cutoffAt: string;
  readonly expectedCik: string;
};

function sameFiling(left: FilingMetadata, right: FilingMetadata): boolean {
  return (
    left.accessionNumber === right.accessionNumber &&
    left.form === right.form &&
    left.filedAt === right.filedAt &&
    left.acceptedAt === right.acceptedAt &&
    left.period === right.period &&
    left.primaryDocument === right.primaryDocument
  );
}

function hasValidChronology(record: FilingMetadata): boolean {
  return Date.parse(record.filedAt) <= Date.parse(record.acceptedAt);
}

export async function loadResolverHistory(
  client: SecClient,
  request: ResolverHistoryRequest,
): Promise<ResolverHistoryResult> {
  const records = new Map<string, FilingMetadata>();
  for (const record of request.submission.records) {
    if (!hasValidChronology(record))
      return { kind: "rejected", reason: "malformed_source" };
    if (!record.accessionNumber.startsWith(request.expectedCik))
      return { kind: "rejected", reason: "source_disagreement" };
    records.set(record.accessionNumber, record);
  }
  const historyFiles = request.submission.historyFiles;
  if (new Set(historyFiles).size !== historyFiles.length)
    return { kind: "rejected", reason: "source_disagreement" };
  if (
    historyFiles.some(
      (filename) =>
        !filename.startsWith(`CIK${request.expectedCik}-submissions-`),
    )
  )
    return { kind: "rejected", reason: "source_disagreement" };
  const contentHashes: string[] = [];
  let latestRetrievedAt: string | undefined;
  for (const filename of historyFiles) {
    let source: SecFetchResult;
    try {
      source = await client.fetch({ kind: "submissions_file", filename });
    } catch (error) {
      if (error instanceof SecClientError && error.code === "SEC_HTTP_STATUS")
        return { kind: "rejected", reason: "missing_history_file" };
      throw error;
    }
    if (source.provenance.retrievedAt > request.cutoffAt)
      return { kind: "rejected", reason: "post_cutoff_source" };
    const parsed = parseHistoricalSubmission(source.bytes);
    if (parsed.kind === "malformed_source")
      return { kind: "rejected", reason: "malformed_source" };
    for (const record of parsed.value) {
      if (!hasValidChronology(record))
        return { kind: "rejected", reason: "malformed_source" };
      if (!record.accessionNumber.startsWith(request.expectedCik))
        return { kind: "rejected", reason: "source_disagreement" };
      const existing = records.get(record.accessionNumber);
      if (existing !== undefined && !sameFiling(existing, record))
        return { kind: "rejected", reason: "source_disagreement" };
      records.set(record.accessionNumber, record);
    }
    contentHashes.push(source.provenance.contentHash);
    if (
      latestRetrievedAt === undefined ||
      source.provenance.retrievedAt > latestRetrievedAt
    )
      latestRetrievedAt = source.provenance.retrievedAt;
  }
  return {
    kind: "merged",
    records: Object.freeze([...records.values()]),
    contentHashes: Object.freeze(contentHashes),
    latestRetrievedAt,
  };
}
