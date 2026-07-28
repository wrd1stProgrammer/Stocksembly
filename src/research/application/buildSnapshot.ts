import { hashCanonical } from "../domain/contractHelpers";
import type {
  SnapshotBuilderDependencies,
  SnapshotBuildInput,
  SnapshotBuildResult,
  SnapshotEvidence,
  SnapshotManifest,
  SnapshotTimes,
} from "./buildSnapshotContracts";
import {
  verifyAmendmentLineage,
  verifyValueRegistry,
} from "./buildSnapshotLineage";
import {
  createEvidenceMandate,
  createSnapshotManifest,
} from "./buildSnapshotManifest";
import {
  mandatoryReasons,
  permittedEvidence,
  snapshotLimitations,
} from "./buildSnapshotPolicy";
import {
  SnapshotBuildError,
  validateBuildEnvelope,
  validateCloseTimes,
  validateCollectionStart,
  validateLifecycleTimes,
  verifyEvidence,
  verifyEvidenceCutoff,
} from "./buildSnapshotValidation";

export type {
  DatasetFailure,
  EvidenceMandate,
  ManifestArtifact,
  SnapshotBuilderDependencies,
  SnapshotBuildInput,
  SnapshotBuildResult,
  SnapshotClockPort,
  SnapshotCloseTimes,
  SnapshotDataset,
  SnapshotEvidence,
  SnapshotIdentity,
  SnapshotManifest,
  SnapshotRegister,
  SnapshotRepositoryPort,
  SnapshotTimes,
  SnapshotVersions,
} from "./buildSnapshotContracts";
export { SnapshotBuildError } from "./buildSnapshotValidation";

type BuilderState =
  | "idle"
  | "collecting"
  | "closed"
  | "snapshot_sealed"
  | "mandate_sealed"
  | "failed";

export class SnapshotBuilderV1 {
  private state: BuilderState = "idle";
  private readonly collected: SnapshotEvidence[] = [];

  constructor(private readonly dependencies: SnapshotBuilderDependencies) {}

  private incomplete(
    reasons: readonly string[],
    limitations: readonly string[],
  ): SnapshotBuildResult {
    this.state = "failed";
    return {
      kind: "incomplete",
      reasons: [...new Set(reasons)].sort(),
      limitations: [...new Set(limitations)].sort(),
    };
  }

  private registerFor(input: SnapshotBuildInput, collectionStartedAt: string) {
    return async (evidence: SnapshotEvidence): Promise<void> => {
      if (this.state !== "collecting")
        throw new SnapshotBuildError(
          "acquisition_closed",
          "retrieval registration is closed",
        );
      if (
        this.collected.some((item) => item.evidenceId === evidence.evidenceId)
      )
        throw new SnapshotBuildError(
          "immutable_overwrite",
          `evidence ${evidence.evidenceId} is already registered`,
        );
      await verifyEvidence(this.dependencies.cas, evidence, {
        runId: input.runId,
        snapshotId: input.snapshotId,
        collectionStartedAt,
      });
      await this.dependencies.repository.registerRetrieval(
        { runId: input.runId, snapshotId: input.snapshotId },
        evidence,
      );
      this.collected.push(evidence);
    };
  }

  async build(input: SnapshotBuildInput): Promise<SnapshotBuildResult> {
    if (this.state !== "idle")
      throw new SnapshotBuildError(
        "builder_reused",
        "a snapshot builder owns exactly one acquisition",
      );
    try {
      validateBuildEnvelope(input);
    } catch (error) {
      if (error instanceof SnapshotBuildError)
        return this.incomplete([error.code], []);
      throw error;
    }
    const collectionStartedAt = this.dependencies.clock.collectionStartedAt();
    try {
      validateCollectionStart(input.requestedAt, collectionStartedAt);
    } catch (error) {
      if (error instanceof SnapshotBuildError)
        return this.incomplete([error.code], []);
      throw error;
    }
    const started = await this.dependencies.repository.beginCollection({
      runId: input.runId,
      snapshotId: input.snapshotId,
      requestedAt: input.requestedAt,
      collectionStartedAt,
    });
    if (started.collectionStartedAt !== collectionStartedAt)
      return this.incomplete(["transaction_time_mismatch"], []);
    this.state = "collecting";
    try {
      await input.collect(this.registerFor(input, collectionStartedAt));
    } catch (error) {
      if (error instanceof SnapshotBuildError)
        return this.incomplete(
          [error.code],
          snapshotLimitations(input, this.collected),
        );
      throw error;
    }
    const identity = input.identity;
    if (identity === undefined)
      return this.incomplete(["identity_missing"], []);
    try {
      verifyAmendmentLineage(this.collected, identity);
    } catch (error) {
      if (error instanceof SnapshotBuildError)
        return this.incomplete(
          [error.code],
          snapshotLimitations(input, this.collected),
        );
      throw error;
    }
    const closeTimes = this.dependencies.clock.closeAndCutoff();
    try {
      validateCloseTimes(collectionStartedAt, closeTimes);
      verifyEvidenceCutoff(this.collected, closeTimes);
    } catch (error) {
      if (error instanceof SnapshotBuildError)
        return this.incomplete(
          [error.code],
          snapshotLimitations(input, this.collected),
        );
      throw error;
    }
    const committedClose =
      await this.dependencies.repository.closeAcquisitionAndRecordCutoff({
        runId: input.runId,
        snapshotId: input.snapshotId,
        ...closeTimes,
      });
    if (
      committedClose.acquisitionClosedAt !== closeTimes.acquisitionClosedAt ||
      committedClose.evidenceCutoffAt !== closeTimes.evidenceCutoffAt
    )
      return this.incomplete(["transaction_time_mismatch"], []);
    this.state = "closed";
    const limitations = snapshotLimitations(input, this.collected);
    const reasons = mandatoryReasons(input, this.collected);
    if (reasons.length > 0) return this.incomplete(reasons, limitations);
    if (input.valueRegistry === undefined)
      return this.incomplete(["value_registry_missing"], limitations);
    const times: SnapshotTimes = {
      requestedAt: input.requestedAt,
      collectionStartedAt,
      ...closeTimes,
      snapshotSealedAt: this.dependencies.clock.snapshotSealedAt(),
      mandateSealedAt: this.dependencies.clock.mandateSealedAt(),
    };
    try {
      validateLifecycleTimes(times);
      verifyValueRegistry(input.valueRegistry, {
        runId: input.runId,
        snapshotId: input.snapshotId,
        evidenceCutoffAt: times.evidenceCutoffAt,
      });
    } catch (error) {
      if (error instanceof SnapshotBuildError)
        return this.incomplete([error.code], limitations);
      throw error;
    }
    const manifest = createSnapshotManifest(
      { ...input, identity, times },
      permittedEvidence(this.collected),
      limitations,
    );
    const reused = await this.dependencies.repository.findSealedByReuseKey(
      manifest.reuseKey,
    );
    if (reused !== undefined) {
      const { manifestHash: storedHash, ...storedBody } = reused.manifest;
      const { mandateHash: storedMandateHash, ...storedMandateBody } =
        reused.mandate;
      if (
        reused.manifest.reuseKey !== manifest.reuseKey ||
        reused.manifest.contentHash !== manifest.contentHash ||
        hashCanonical(storedBody) !== storedHash ||
        reused.mandate.manifestHash !== storedHash ||
        hashCanonical(storedMandateBody) !== storedMandateHash
      )
        return this.incomplete(["reuse_hash_mismatch"], limitations);
      this.state = "mandate_sealed";
      return { kind: "sealed", reused: true, ...reused };
    }
    await this.dependencies.repository.sealSnapshot(manifest);
    this.state = "snapshot_sealed";
    const mandate = createEvidenceMandate(manifest, times.mandateSealedAt);
    await this.dependencies.repository.sealMandate(mandate);
    this.state = "mandate_sealed";
    return { kind: "sealed", reused: false, manifest, mandate };
  }

  async openForAgent(
    manifestHash: string,
  ): Promise<SnapshotManifest | undefined> {
    const manifest =
      await this.dependencies.repository.openAgentManifest(manifestHash);
    if (manifest === undefined) return undefined;
    const { manifestHash: _manifestHash, ...withoutHash } = manifest;
    return hashCanonical(withoutHash) === manifest.manifestHash
      ? manifest
      : undefined;
  }
}
