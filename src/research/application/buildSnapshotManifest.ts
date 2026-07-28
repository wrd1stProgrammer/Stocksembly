import { hashCanonical } from "../domain/contractHelpers";
import type {
  EvidenceMandate,
  ManifestArtifact,
  SnapshotBuildInput,
  SnapshotEvidence,
  SnapshotManifest,
  SnapshotManifestBody,
  SnapshotTimes,
} from "./buildSnapshotContracts";

function manifestArtifact(evidence: SnapshotEvidence): ManifestArtifact {
  return {
    evidenceId: evidence.evidenceId,
    dataset: evidence.dataset,
    rightsSource: evidence.rightsSource,
    retrievedAt: evidence.retrievedAt,
    rawHash: evidence.raw.digest,
    ...(evidence.normalized === undefined
      ? {}
      : { normalizedHash: evidence.normalized.digest }),
    ...(evidence.form === undefined ? {} : { form: evidence.form }),
    ...(evidence.accessionNumber === undefined
      ? {}
      : { accessionNumber: evidence.accessionNumber }),
    ...(evidence.parentAccessionNumber === undefined
      ? {}
      : { parentAccessionNumber: evidence.parentAccessionNumber }),
    ...(evidence.cik === undefined ? {} : { cik: evidence.cik }),
    ...(evidence.filedAt === undefined ? {} : { filedAt: evidence.filedAt }),
    ...(evidence.acceptedAt === undefined
      ? {}
      : { acceptedAt: evidence.acceptedAt }),
    ...(evidence.current === undefined ? {} : { current: evidence.current }),
  };
}

export function createSnapshotManifest(
  input: Pick<
    SnapshotBuildInput,
    | "capabilities"
    | "failures"
    | "runId"
    | "snapshotId"
    | "valueRegistry"
    | "versions"
  > & {
    readonly identity: NonNullable<SnapshotBuildInput["identity"]>;
    readonly times: SnapshotTimes;
  },
  evidence: readonly SnapshotEvidence[],
  limitations: readonly string[],
): SnapshotManifest {
  const artifacts = evidence
    .map(manifestArtifact)
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  const amendments = artifacts
    .filter(
      (
        item,
      ): item is ManifestArtifact & {
        readonly accessionNumber: string;
        readonly parentAccessionNumber: string;
      } =>
        item.accessionNumber !== undefined &&
        item.parentAccessionNumber !== undefined,
    )
    .map((item) => ({
      accessionNumber: item.accessionNumber,
      parentAccessionNumber: item.parentAccessionNumber,
    }));
  const rights = [...new Set(artifacts.map((item) => item.rightsSource))]
    .sort()
    .map((source) => ({ source, decision: "allowed" as const }));
  const body: SnapshotManifestBody = {
    schemaVersion: "snapshot-v1",
    runId: input.runId,
    snapshotId: input.snapshotId,
    identity: input.identity,
    requestedAt: input.times.requestedAt,
    collectionStartedAt: input.times.collectionStartedAt,
    acquisitionClosedAt: input.times.acquisitionClosedAt,
    evidenceCutoffAt: input.times.evidenceCutoffAt,
    snapshotSealedAt: input.times.snapshotSealedAt,
    versions: input.versions,
    capabilities: {
      version: input.capabilities.version,
      disclosures: [...input.capabilities.disclosures].sort((left, right) =>
        left.key.localeCompare(right.key),
      ),
    },
    artifacts,
    amendments,
    valueRegistry: input.valueRegistry ?? {
      runId: input.runId,
      snapshotId: input.snapshotId,
      records: [],
    },
    rights,
    failures: [...input.failures].sort((left, right) =>
      `${left.dataset}:${left.code}`.localeCompare(
        `${right.dataset}:${right.code}`,
      ),
    ),
    limitations,
  };
  const contentHash = hashCanonical({
    identity: body.identity,
    artifacts: body.artifacts,
    amendments: body.amendments,
    valueRegistry: body.valueRegistry,
    rights: body.rights,
  });
  const reuseKey = hashCanonical({
    runId: body.runId,
    snapshotId: body.snapshotId,
    evidenceCutoffAt: body.evidenceCutoffAt,
    contentHash,
    versions: body.versions,
    capabilities: body.capabilities,
    failures: body.failures,
    limitations: body.limitations,
  });
  return Object.freeze({
    ...body,
    contentHash,
    reuseKey,
    manifestHash: hashCanonical({ ...body, contentHash, reuseKey }),
  });
}

export function createEvidenceMandate(
  manifest: SnapshotManifest,
  sealedAt: string,
): EvidenceMandate {
  const body = {
    runId: manifest.runId,
    snapshotId: manifest.snapshotId,
    manifestHash: manifest.manifestHash,
    sealedAt,
  };
  return Object.freeze({ ...body, mandateHash: hashCanonical(body) });
}
