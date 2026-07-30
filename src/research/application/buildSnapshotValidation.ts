import {
  hashBytes,
  hashCanonical,
  isSha256,
  timestampMillis,
} from "../domain/contractHelpers";
import { RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { evaluateModelTransfer, type RightsSource } from "../domain/rights";
import type { ArtifactCasPort, ArtifactDescriptor } from "../ports/artifacts";
import { validateCapabilities } from "./buildSnapshotCapabilityValidation";
import type {
  SnapshotBuildInput,
  SnapshotCloseTimes,
  SnapshotDataset,
  SnapshotEvidence,
  SnapshotTimes,
} from "./buildSnapshotContracts";

export class SnapshotBuildError extends Error {
  readonly name = "SnapshotBuildError";

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: string, message: string): never {
  throw new SnapshotBuildError(code, message);
}

export function validateBuildEnvelope(input: SnapshotBuildInput): void {
  RunIdSchema.parse(input.runId);
  SnapshotIdSchema.parse(input.snapshotId);
  timestampMillis(input.requestedAt);
  if (input.capabilities.version !== "workflow-v1")
    fail("capability_version", "unsupported capability manifest version");
  validateCapabilities(input, fail);
  if (
    input.identity !== undefined &&
    (!/^\d{10}$/.test(input.identity.cik) ||
      !isSha256(input.identity.identityHash))
  )
    fail("identity_invalid", "resolved identity has invalid provenance");
}

export function validateCollectionStart(
  requestedAt: string,
  collectionStartedAt: string,
): void {
  if (timestampMillis(collectionStartedAt) < timestampMillis(requestedAt))
    fail("collection_before_request", "collection starts before the request");
}

export function validateLifecycleTimes(times: SnapshotTimes): void {
  validateCollectionStart(times.requestedAt, times.collectionStartedAt);
  validateCloseTimes(times.collectionStartedAt, {
    acquisitionClosedAt: times.acquisitionClosedAt,
    evidenceCutoffAt: times.evidenceCutoffAt,
  });
  if (
    timestampMillis(times.snapshotSealedAt) <=
    timestampMillis(times.evidenceCutoffAt)
  )
    fail("snapshot_seal_order", "snapshot must seal after cutoff");
  if (
    timestampMillis(times.mandateSealedAt) <=
    timestampMillis(times.snapshotSealedAt)
  )
    fail("mandate_first", "mandate must seal strictly after snapshot");
}

export function validateCloseTimes(
  collectionStartedAt: string,
  times: SnapshotCloseTimes,
): void {
  if (
    timestampMillis(times.acquisitionClosedAt) <
    timestampMillis(collectionStartedAt)
  )
    fail("close_before_collection", "acquisition closes before collection");
  if (
    timestampMillis(times.evidenceCutoffAt) <=
    timestampMillis(times.acquisitionClosedAt)
  )
    fail("cutoff_order", "cutoff must be after acquisition close");
}

const DATASET_RIGHTS_SOURCES = {
  identity: ["sec_ticker_exchange"],
  sec_filing: ["sec_primary_filing"],
  sec_company_facts: ["sec_company_facts"],
  sec_insider_transactions: ["sec_primary_filing"],
  sec_institutional_holdings: ["sec_primary_filing"],
  bls_macro: ["bls_allowlist"],
  treasury_yield: ["treasury_yield"],
  market_bars: ["alpaca_market_data", "insightsentry_rapidapi"],
  insightsentry_quote: ["insightsentry_rapidapi"],
  sec_exhibit: ["sec_exhibit"],
  insightsentry_fundamentals: ["insightsentry_rapidapi"],
  insightsentry_news: ["insightsentry_rapidapi"],
  insightsentry_news_company: ["insightsentry_rapidapi"],
  insightsentry_news_market: ["insightsentry_rapidapi"],
  insightsentry_news_risk: ["insightsentry_rapidapi"],
  insightsentry_documents: ["insightsentry_rapidapi"],
  insightsentry_calendar: ["insightsentry_rapidapi"],
  insightsentry_peers: ["insightsentry_rapidapi"],
  insightsentry_options: ["insightsentry_rapidapi"],
  insightsentry_request_ledger: ["insightsentry_rapidapi"],
  captured_web: ["captured_web"],
} as const satisfies Readonly<Record<SnapshotDataset, readonly RightsSource[]>>;

function descriptorIdentity(descriptor: ArtifactDescriptor): object {
  return {
    artifactId: descriptor.artifactId,
    runId: descriptor.runId,
    snapshotId: descriptor.snapshotId,
    digest: descriptor.digest,
    byteLength: descriptor.byteLength,
    mediaType: descriptor.mediaType,
    parentDigests: descriptor.parentDigests,
  };
}

type CasVerificationContext = {
  readonly cas: ArtifactCasPort;
  readonly runId: string;
  readonly snapshotId: string;
  readonly visited: Set<string>;
  readonly active: Set<string>;
};

async function verifyCasNode(
  descriptor: ArtifactDescriptor,
  context: CasVerificationContext,
): Promise<void> {
  if (context.active.has(descriptor.digest))
    fail("cas_cycle", "artifact parent graph contains a cycle");
  if (context.visited.has(descriptor.digest)) return;
  const read = await context.cas.get(descriptor.digest);
  if (read === undefined)
    fail("cas_parent_missing", `artifact ${descriptor.digest} is missing`);
  if (
    hashCanonical(descriptorIdentity(read.descriptor)) !==
    hashCanonical(descriptorIdentity(descriptor))
  )
    fail("cas_descriptor_mismatch", "artifact descriptor does not match CAS");
  if (hashBytes(read.bytes) !== descriptor.digest)
    fail("cas_hash_mismatch", "artifact bytes do not match their digest");
  if (
    descriptor.runId !== context.runId ||
    descriptor.snapshotId !== context.snapshotId
  )
    fail("cross_run", "artifact crosses run or snapshot lineage");
  context.active.add(descriptor.digest);
  for (const parentDigest of descriptor.parentDigests) {
    const parent = await context.cas.get(parentDigest);
    if (parent === undefined)
      fail("cas_parent_missing", `artifact parent ${parentDigest} is missing`);
    if (parent.descriptor.digest !== parentDigest)
      fail("cas_parent_hash", "artifact parent digest does not match its edge");
    await verifyCasNode(parent.descriptor, context);
  }
  context.active.delete(descriptor.digest);
  context.visited.add(descriptor.digest);
}

export async function verifyEvidence(
  cas: ArtifactCasPort,
  evidence: SnapshotEvidence,
  input: Pick<SnapshotBuildInput, "runId" | "snapshotId"> & {
    readonly collectionStartedAt: string;
  },
): Promise<void> {
  if (
    !DATASET_RIGHTS_SOURCES[evidence.dataset].some(
      (source) => source === evidence.rightsSource,
    )
  )
    fail("rights_source_mismatch", "dataset rights source is relabeled");
  if (
    evidence.rightsSource === "insightsentry_rapidapi" &&
    evidence.normalized === undefined
  )
    fail(
      "provider_normalized_missing",
      "licensed provider evidence requires a normalized child",
    );
  if (
    timestampMillis(evidence.retrievedAt) <
    timestampMillis(input.collectionStartedAt)
  )
    fail("retrieved_before_collection", "retrieval predates collection start");
  if (evidence.dataset === "sec_filing") {
    if (evidence.filedAt === undefined || evidence.acceptedAt === undefined)
      fail("filing_time_missing", "SEC filing availability times are required");
    if (
      timestampMillis(evidence.acceptedAt) < timestampMillis(evidence.filedAt)
    )
      fail("filing_time_order", "filing acceptance precedes filing time");
    if (
      timestampMillis(evidence.acceptedAt) >
      timestampMillis(evidence.retrievedAt)
    )
      fail("filing_time_order", "filing acceptance follows retrieval");
  }
  const visited = new Set<string>();
  const context: CasVerificationContext = {
    cas,
    runId: input.runId,
    snapshotId: input.snapshotId,
    visited,
    active: new Set<string>(),
  };
  await verifyCasNode(evidence.raw, context);
  if (evidence.normalized !== undefined) {
    if (!evidence.normalized.parentDigests.includes(evidence.raw.digest))
      fail(
        "normalized_parent_missing",
        "normalized evidence must name its raw parent",
      );
    await verifyCasNode(evidence.normalized, context);
  }
}

export function verifyEvidenceCutoff(
  evidence: readonly SnapshotEvidence[],
  times: SnapshotCloseTimes,
): void {
  for (const item of evidence) {
    if (
      timestampMillis(item.retrievedAt) >
        timestampMillis(times.acquisitionClosedAt) ||
      timestampMillis(item.retrievedAt) >
        timestampMillis(times.evidenceCutoffAt)
    )
      fail("post_cutoff", "retrieval is outside the closed acquisition");
    if (
      item.dataset === "sec_filing" &&
      (item.filedAt === undefined ||
        item.acceptedAt === undefined ||
        timestampMillis(item.filedAt) >
          timestampMillis(times.evidenceCutoffAt) ||
        timestampMillis(item.acceptedAt) >
          timestampMillis(times.evidenceCutoffAt))
    )
      fail("post_cutoff", "filing was first available after cutoff");
  }
}

export function isMandatoryEvidence(evidence: SnapshotEvidence): boolean {
  return (
    evidence.dataset === "identity" ||
    (evidence.dataset === "sec_filing" && evidence.form === "10-K") ||
    (evidence.dataset === "sec_company_facts" && evidence.current === true)
  );
}

export function rightsAllowed(evidence: SnapshotEvidence): boolean {
  return evaluateModelTransfer(evidence.rightsSource).kind === "allowed";
}
