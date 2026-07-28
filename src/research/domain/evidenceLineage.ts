import { ContractViolation, hashCanonical, isSha256 } from "./contractHelpers";

export type ArtifactEdge = {
  readonly childRunId: string;
  readonly childSnapshotId: string;
  readonly childHash: string;
  readonly parentRunId: string;
  readonly parentSnapshotId: string;
  readonly parentHash: string;
  readonly edgeHash: string;
};

export function linkArtifact(
  input: Omit<ArtifactEdge, "edgeHash">,
): ArtifactEdge {
  if (!isSha256(input.childHash) || !isSha256(input.parentHash))
    throw new ContractViolation(
      "invalid_hash",
      "artifact edges require SHA-256 hashes",
    );
  if (
    input.childRunId !== input.parentRunId ||
    input.childSnapshotId !== input.parentSnapshotId
  )
    throw new ContractViolation(
      "lineage_mismatch",
      "artifact parent must share run and snapshot lineage",
    );
  return { ...input, edgeHash: hashCanonical(input) };
}
