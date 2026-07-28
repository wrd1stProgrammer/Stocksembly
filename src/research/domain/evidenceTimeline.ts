import {
  assertTimestampOrder,
  ContractViolation,
  timestampMillis,
} from "./contractHelpers";
import { createEvidenceRecord, createRawArtifact } from "./evidenceArtifacts";
import {
  type EvidenceRecord,
  type RawArtifact,
  type RawArtifactInput,
  TimestampSchema,
  UuidSchema,
} from "./evidenceSchemas";

export type AcquisitionState =
  | "acquiring"
  | "cutoff_recorded"
  | "snapshot_sealed"
  | "mandate_sealed";
export type AcquisitionLedger = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly requestedAt: string;
  readonly collectionStartedAt?: string;
  readonly acquisitionClosedAt?: string;
  readonly evidenceCutoffAt?: string;
  readonly snapshotSealedAt?: string;
  readonly mandateSealedAt?: string;
  readonly state: AcquisitionState;
  readonly evidence: readonly EvidenceRecord[];
  readonly rawArtifacts: readonly RawArtifact[];
  readonly snapshotHash?: string;
};

type AcquisitionInput = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly requestedAt: string;
};
export function createAcquisitionLedger(
  input: AcquisitionInput,
): AcquisitionLedger {
  UuidSchema.parse(input.runId);
  UuidSchema.parse(input.snapshotId);
  TimestampSchema.parse(input.requestedAt);
  return { ...input, state: "acquiring", evidence: [], rawArtifacts: [] };
}

export function beginCollection(
  ledger: AcquisitionLedger,
  collectionStartedAt: string,
): AcquisitionLedger {
  if (ledger.state !== "acquiring")
    throw new ContractViolation(
      "state_transition",
      "collection is already closed",
    );
  TimestampSchema.parse(collectionStartedAt);
  assertTimestampOrder(
    ledger.requestedAt,
    collectionStartedAt,
    "collectionStartedAt",
  );
  return { ...ledger, collectionStartedAt };
}

export function recordRetrievedEvidence(
  ledger: AcquisitionLedger,
  input: RawArtifactInput,
): AcquisitionLedger {
  if (ledger.state !== "acquiring")
    throw new ContractViolation(
      "acquisition_closed",
      "retrieval after cutoff is blocked",
    );
  if (input.runId !== ledger.runId || input.snapshotId !== ledger.snapshotId)
    throw new ContractViolation(
      "lineage_mismatch",
      "retrieved evidence belongs to another run or snapshot",
    );
  if (
    ledger.rawArtifacts.some(
      (artifact) => artifact.artifactId === input.artifactId,
    )
  )
    throw new ContractViolation(
      "immutable_overwrite",
      "retrieved artifacts cannot silently overwrite an existing artifact",
    );
  if (ledger.collectionStartedAt === undefined)
    throw new ContractViolation(
      "collection_not_started",
      "collection must start before retrieval",
    );
  assertTimestampOrder(
    ledger.collectionStartedAt,
    input.retrievedAt,
    "retrievedAt",
  );
  const raw = createRawArtifact(input);
  const evidence = createEvidenceRecord({
    evidenceId: raw.artifactId,
    runId: raw.runId,
    snapshotId: raw.snapshotId,
    locator: raw.locator,
    retrievedAt: raw.retrievedAt,
    ...(raw.sourcePublishedAt === undefined
      ? {}
      : { sourcePublishedAt: raw.sourcePublishedAt }),
    payloadHash: raw.contentHash,
    revisionKind: "original",
  });
  return {
    ...ledger,
    evidence: [...ledger.evidence, evidence],
    rawArtifacts: [...ledger.rawArtifacts, raw],
  };
}

export function closeAcquisition(
  ledger: AcquisitionLedger,
  input: {
    readonly evidenceCutoffAt: string;
    readonly acquisitionClosedAt?: string;
  },
): AcquisitionLedger {
  if (ledger.state !== "acquiring")
    throw new ContractViolation("state_transition", "acquisition is not open");
  if (ledger.collectionStartedAt === undefined)
    throw new ContractViolation(
      "collection_not_started",
      "collection must start before cutoff",
    );
  TimestampSchema.parse(input.evidenceCutoffAt);
  if (
    timestampMillis(input.evidenceCutoffAt) ===
    timestampMillis(ledger.requestedAt)
  )
    throw new ContractViolation(
      "request_is_cutoff",
      "requestedAt is not evidenceCutoffAt",
    );
  assertTimestampOrder(
    ledger.collectionStartedAt,
    input.evidenceCutoffAt,
    "evidenceCutoffAt",
  );
  for (const record of ledger.evidence) {
    assertTimestampOrder(
      record.retrievedAt,
      input.evidenceCutoffAt,
      "retrievedAt/cutoff",
    );
    if (record.locator.kind === "sec_filing") {
      assertTimestampOrder(
        record.locator.filedAt,
        input.evidenceCutoffAt,
        "filedAt/cutoff",
      );
      assertTimestampOrder(
        record.locator.acceptedAt,
        input.evidenceCutoffAt,
        "acceptedAt/cutoff",
      );
    }
    if (record.sourcePublishedAt !== undefined)
      assertTimestampOrder(
        record.sourcePublishedAt,
        input.evidenceCutoffAt,
        "sourcePublishedAt/cutoff",
      );
  }
  if (input.acquisitionClosedAt === undefined)
    throw new ContractViolation(
      "acquisition_close_missing",
      "acquisitionClosedAt must be recorded before the cutoff",
    );
  const acquisitionClosedAt = input.acquisitionClosedAt;
  TimestampSchema.parse(acquisitionClosedAt);
  assertTimestampOrder(
    ledger.collectionStartedAt,
    acquisitionClosedAt,
    "acquisitionClosedAt",
  );
  if (
    timestampMillis(acquisitionClosedAt) >=
    timestampMillis(input.evidenceCutoffAt)
  )
    throw new ContractViolation(
      "acquisition_not_closed_before_cutoff",
      "acquisition must close before the authoritative cutoff",
    );
  return {
    ...ledger,
    acquisitionClosedAt,
    evidenceCutoffAt: input.evidenceCutoffAt,
    state: "cutoff_recorded",
  };
}
