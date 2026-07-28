import {
  assertTimestampOrder,
  ContractViolation,
  hashCanonical,
  timestampMillis,
} from "./contractHelpers";
import { TimestampSchema } from "./evidenceSchemas";
import type { AcquisitionLedger } from "./evidenceTimeline";

export function sealSnapshot(
  ledger: AcquisitionLedger,
  snapshotSealedAt: string,
): AcquisitionLedger {
  if (
    ledger.state !== "cutoff_recorded" ||
    ledger.evidenceCutoffAt === undefined
  )
    throw new ContractViolation(
      "state_transition",
      "snapshot requires a recorded evidence cutoff",
    );
  TimestampSchema.parse(snapshotSealedAt);
  assertTimestampOrder(
    ledger.evidenceCutoffAt,
    snapshotSealedAt,
    "snapshotSealedAt",
  );
  const snapshotHash = hashCanonical({
    runId: ledger.runId,
    snapshotId: ledger.snapshotId,
    cutoff: ledger.evidenceCutoffAt,
    evidence: ledger.evidence.map((record) => record.recordHash),
  });
  return {
    ...ledger,
    snapshotSealedAt,
    snapshotHash,
    state: "snapshot_sealed",
  };
}

export function sealMandate(
  ledger: AcquisitionLedger,
  mandateSealedAt: string,
): AcquisitionLedger {
  if (
    ledger.state !== "snapshot_sealed" ||
    ledger.snapshotSealedAt === undefined
  )
    throw new ContractViolation(
      "state_transition",
      "mandate requires a sealed snapshot",
    );
  TimestampSchema.parse(mandateSealedAt);
  if (
    timestampMillis(mandateSealedAt) <= timestampMillis(ledger.snapshotSealedAt)
  )
    throw new ContractViolation(
      "mandate_not_after_snapshot",
      "mandate sealing must occur strictly after snapshot sealing",
    );
  return { ...ledger, mandateSealedAt, state: "mandate_sealed" };
}
