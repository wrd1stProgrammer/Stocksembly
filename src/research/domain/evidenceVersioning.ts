import {
  ContractViolation,
  hashCanonical,
  timestampMillis,
} from "./contractHelpers";
import {
  createEvidenceRecord,
  type EvidenceRecordDraft,
} from "./evidenceArtifacts";
import {
  type EvidenceRecord,
  EvidenceRecordSchema,
  TimestampSchema,
} from "./evidenceSchemas";

export type EvidenceChainContext = {
  readonly evidenceCutoffAt: string;
  readonly snapshotSealedAt: string;
};
export type EvidenceChain = EvidenceChainContext & {
  readonly runId: string;
  readonly snapshotId: string;
  readonly contextHash: string;
  readonly versions: readonly EvidenceRecord[];
};

function evidenceChainContextHash(
  chain: Pick<
    EvidenceChain,
    "runId" | "snapshotId" | "evidenceCutoffAt" | "snapshotSealedAt"
  > & { readonly original: EvidenceRecord },
): string {
  return hashCanonical({
    runId: chain.runId,
    snapshotId: chain.snapshotId,
    evidenceCutoffAt: chain.evidenceCutoffAt,
    snapshotSealedAt: chain.snapshotSealedAt,
    originalEvidenceId: chain.original.evidenceId,
    originalRecordHash: chain.original.recordHash,
  });
}

export function createEvidenceChain(
  original: EvidenceRecord,
  context: EvidenceChainContext,
): EvidenceChain {
  const parsedOriginal = EvidenceRecordSchema.parse(original);
  if (parsedOriginal.revisionKind !== "original")
    throw new ContractViolation(
      "original_version",
      "an evidence chain must begin with exactly one original version",
    );
  TimestampSchema.parse(context.evidenceCutoffAt);
  TimestampSchema.parse(context.snapshotSealedAt);
  if (
    timestampMillis(context.snapshotSealedAt) <
    timestampMillis(context.evidenceCutoffAt)
  )
    throw new ContractViolation(
      "snapshot_not_sealed",
      "snapshot sealing must follow the authoritative cutoff",
    );
  assertWithinChainCutoff(parsedOriginal, context);
  const chain = {
    runId: parsedOriginal.runId,
    snapshotId: parsedOriginal.snapshotId,
    ...context,
    versions: [parsedOriginal],
  };
  return {
    ...chain,
    contextHash: evidenceChainContextHash({
      ...chain,
      original: parsedOriginal,
    }),
  };
}

function assertWithinChainCutoff(
  record: EvidenceRecord,
  context: EvidenceChainContext,
): void {
  const cutoff = timestampMillis(context.evidenceCutoffAt);
  const timestamps = [
    record.retrievedAt,
    record.sourcePublishedAt,
    record.locator.kind === "sec_filing" ? record.locator.filedAt : undefined,
    record.locator.kind === "sec_filing"
      ? record.locator.acceptedAt
      : undefined,
  ];
  if (
    timestamps.some(
      (timestamp) =>
        timestamp !== undefined && timestampMillis(timestamp) > cutoff,
    )
  )
    throw new ContractViolation(
      "post_cutoff",
      "evidence amendment is after the sealed snapshot cutoff",
    );
}

export function appendEvidenceVersion(
  chainOrOriginal: EvidenceChain | EvidenceRecord,
  input: EvidenceRecord | EvidenceRecordDraft,
  context?: EvidenceChainContext,
): EvidenceChain {
  const chain: EvidenceChain =
    "versions" in chainOrOriginal
      ? chainOrOriginal
      : context === undefined
        ? (() => {
            throw new ContractViolation(
              "cutoff_context_missing",
              "amendments require an existing sealed snapshot context",
            );
          })()
        : createEvidenceChain(chainOrOriginal, context);
  TimestampSchema.parse(chain.evidenceCutoffAt);
  TimestampSchema.parse(chain.snapshotSealedAt);
  const original = chain.versions[0];
  if (original === undefined)
    throw new ContractViolation(
      "lineage_mismatch",
      "evidence chain must preserve an original version",
    );
  if (
    chain.runId !== original.runId ||
    chain.snapshotId !== original.snapshotId
  )
    throw new ContractViolation(
      "lineage_mismatch",
      "sealed chain context must match the original evidence",
    );
  if (
    chain.versions.filter((version) => version.revisionKind === "original")
      .length !== 1 ||
    chain.versions[0]?.revisionKind !== "original"
  )
    throw new ContractViolation(
      "original_version",
      "an evidence chain must contain exactly one initial original",
    );
  if (evidenceChainContextHash({ ...chain, original }) !== chain.contextHash)
    throw new ContractViolation(
      "cutoff_context_tampered",
      "sealed snapshot context is immutable",
    );
  if (
    "recordHash" in input === false &&
    input.evidenceCutoffAt !== undefined &&
    input.evidenceCutoffAt !== chain.evidenceCutoffAt
  )
    throw new ContractViolation(
      "cutoff_override",
      "caller-provided amendment cutoff cannot override the sealed context",
    );
  const next =
    "recordHash" in input
      ? EvidenceRecordSchema.parse(input)
      : createEvidenceRecord({
          ...input,
          ...(input.revisionKind === "original" ||
          input.amendsEvidenceId !== undefined
            ? {}
            : { amendsEvidenceId: original.evidenceId }),
        });
  if (next.revisionKind !== "amendment")
    throw new ContractViolation(
      "revision_kind",
      "evidence chain appends must be amendments",
    );
  if (chain.versions.some((version) => version.evidenceId === next.evidenceId))
    throw new ContractViolation(
      "immutable_overwrite",
      "evidence versions cannot be overwritten or duplicated",
    );
  if (next.runId !== original.runId || next.snapshotId !== original.snapshotId)
    throw new ContractViolation(
      "lineage_mismatch",
      "amendment must remain in the same run and snapshot",
    );
  assertWithinChainCutoff(next, chain);
  if (next.amendsEvidenceId !== original.evidenceId)
    throw new ContractViolation(
      "amendment_parent",
      "amendment must point to the preserved original evidence",
    );
  return { ...chain, versions: [...chain.versions, next] };
}
