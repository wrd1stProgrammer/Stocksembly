import { hashBytes } from "../domain/contractHelpers";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import {
  type ArtifactCasPort,
  type ArtifactDescriptor,
  type ArtifactDigest,
  ArtifactDigestSchema,
  type ArtifactRead,
} from "../ports/artifacts";
import type {
  EvidenceMandate,
  SnapshotClockPort,
  SnapshotCloseTimes,
  SnapshotEvidence,
  SnapshotManifest,
  SnapshotRepositoryPort,
} from "./buildSnapshot";

export class MemorySnapshotClock implements SnapshotClockPort {
  constructor(
    private readonly values: {
      readonly collectionStartedAt: string;
      readonly close: SnapshotCloseTimes;
      readonly snapshotSealedAt: string;
      readonly mandateSealedAt: string;
    },
  ) {}

  collectionStartedAt(): string {
    return this.values.collectionStartedAt;
  }

  closeAndCutoff(): SnapshotCloseTimes {
    return this.values.close;
  }

  snapshotSealedAt(): string {
    return this.values.snapshotSealedAt;
  }

  mandateSealedAt(): string {
    return this.values.mandateSealedAt;
  }
}

export class MemoryCas implements ArtifactCasPort {
  private readonly values = new Map<ArtifactDigest, ArtifactRead>();
  private ordinal = 1;

  add(
    bytes: string,
    lineage: { readonly runId: string; readonly snapshotId: string },
    parents: readonly ArtifactDigest[] = [],
  ): ArtifactDescriptor {
    const digest = ArtifactDigestSchema.parse(hashBytes(bytes));
    const descriptor: ArtifactDescriptor = Object.freeze({
      artifactId: ArtifactIdSchema.parse(
        `00000000-0000-4000-8000-${String(this.ordinal).padStart(12, "0")}`,
      ),
      runId: RunIdSchema.parse(lineage.runId),
      snapshotId: SnapshotIdSchema.parse(lineage.snapshotId),
      digest,
      byteLength: new TextEncoder().encode(bytes).byteLength,
      mediaType: "application/json",
      parentDigests: Object.freeze([...parents]),
    });
    this.ordinal += 1;
    this.values.set(digest, {
      descriptor,
      bytes: new TextEncoder().encode(bytes),
    });
    return descriptor;
  }

  corrupt(digest: ArtifactDigest): void {
    const current = this.values.get(digest);
    if (current !== undefined)
      this.values.set(digest, {
        descriptor: current.descriptor,
        bytes: new TextEncoder().encode("corrupt"),
      });
  }

  async put(): Promise<ArtifactDescriptor> {
    throw new TypeError("test CAS only accepts fixtures");
  }

  async get(digest: ArtifactDigest): Promise<ArtifactRead | undefined> {
    return this.values.get(digest);
  }

  async has(digest: ArtifactDigest): Promise<boolean> {
    return this.values.has(digest);
  }
}

export class MemorySnapshotRepository implements SnapshotRepositoryPort {
  readonly operations: string[] = [];
  private readonly states = new Map<
    string,
    "collecting" | "closed" | "sealed"
  >();
  private readonly sealed = new Map<
    string,
    { readonly manifest: SnapshotManifest; readonly mandate: EvidenceMandate }
  >();
  private readonly pending = new Map<string, SnapshotManifest>();

  async beginCollection(input: {
    readonly snapshotId: string;
    readonly collectionStartedAt: string;
  }): Promise<{ readonly collectionStartedAt: string }> {
    this.states.set(input.snapshotId, "collecting");
    this.operations.push("collection_started");
    return { collectionStartedAt: input.collectionStartedAt };
  }

  async registerRetrieval(
    identity: { readonly snapshotId: string },
    evidence: SnapshotEvidence,
  ): Promise<void> {
    if (this.states.get(identity.snapshotId) !== "collecting")
      throw new TypeError("repository acquisition closed");
    this.operations.push(`registered:${evidence.evidenceId}`);
  }

  async closeAcquisitionAndRecordCutoff(input: {
    readonly snapshotId: string;
    readonly acquisitionClosedAt: string;
    readonly evidenceCutoffAt: string;
  }): Promise<SnapshotCloseTimes> {
    this.states.set(input.snapshotId, "closed");
    this.operations.push("close_and_cutoff_transaction");
    return {
      acquisitionClosedAt: input.acquisitionClosedAt,
      evidenceCutoffAt: input.evidenceCutoffAt,
    };
  }

  async findSealedByReuseKey(reuseKey: string) {
    return this.sealed.get(reuseKey);
  }

  async sealSnapshot(manifest: SnapshotManifest): Promise<void> {
    if (this.states.get(manifest.snapshotId) !== "closed")
      throw new TypeError("snapshot sealed before close");
    this.states.set(manifest.snapshotId, "sealed");
    this.pending.set(manifest.manifestHash, manifest);
    this.operations.push("snapshot_sealed");
  }

  async sealMandate(mandate: EvidenceMandate): Promise<void> {
    if (this.states.get(mandate.snapshotId) !== "sealed")
      throw new TypeError("mandate sealed first");
    const manifest = this.pending.get(mandate.manifestHash);
    this.operations.push("mandate_sealed");
    if (manifest !== undefined)
      this.sealed.set(manifest.reuseKey, { manifest, mandate });
  }

  async openAgentManifest(manifestHash: string) {
    return [...this.sealed.values()].find(
      (entry) => entry.manifest.manifestHash === manifestHash,
    )?.manifest;
  }
}
