import { createHash } from "node:crypto";
import type { RunId, TickerSymbol } from "../../domain/ids";
import type { PublicResearchEvent } from "../../domain/publicEvent";
import {
  type ArtifactCasPort,
  type ArtifactDescriptor,
  type ArtifactDigest,
  ArtifactDigestSchema,
  type ArtifactRead,
  type ArtifactWrite,
} from "../artifacts";
import type {
  CancellationSignalPort,
  CapacitySnapshot,
  CodexRunnerPort,
  CodexRunRequest,
  CodexRunResult,
  DiskCapacityProbePort,
  PublicEventNotifierPort,
  SnapshotClockPort,
} from "../runtime";
import type {
  IssuerIdentity,
  IssuerSourcePort,
  MacroCollectionRequest,
  MacroSourcePort,
  SecCollectionRequest,
  SecSourcePort,
  SourceCapability,
  SourceDocument,
} from "../sources";

export class StrictArtifactCasFake implements ArtifactCasPort {
  private readonly artifacts = new Map<ArtifactDigest, ArtifactRead>();

  async put(artifact: ArtifactWrite): Promise<ArtifactDescriptor> {
    const digest = ArtifactDigestSchema.parse(
      createHash("sha256").update(artifact.bytes).digest("hex"),
    );
    const descriptor = {
      artifactId: artifact.artifactId,
      runId: artifact.runId,
      snapshotId: artifact.snapshotId,
      digest,
      byteLength: artifact.bytes.byteLength,
      mediaType: artifact.mediaType,
      parentDigests: artifact.parentDigests,
    } satisfies ArtifactDescriptor;
    if (!this.artifacts.has(digest)) {
      this.artifacts.set(digest, {
        descriptor,
        bytes: artifact.bytes.slice(),
      });
    }
    return descriptor;
  }

  async get(digest: ArtifactDigest): Promise<ArtifactRead | undefined> {
    const artifact = this.artifacts.get(digest);
    return artifact === undefined
      ? undefined
      : { descriptor: artifact.descriptor, bytes: artifact.bytes.slice() };
  }

  async has(digest: ArtifactDigest): Promise<boolean> {
    return this.artifacts.has(digest);
  }
}

export class StrictIssuerSourceFake implements IssuerSourcePort {
  constructor(private readonly issuer: IssuerIdentity) {}

  async capability(): Promise<SourceCapability> {
    return { available: true };
  }

  async resolve(
    ticker: TickerSymbol,
    cutoffAt: string,
  ): Promise<IssuerIdentity | undefined> {
    void cutoffAt;
    return ticker === this.issuer.ticker ? this.issuer : undefined;
  }
}

abstract class StrictDocumentSourceFake {
  constructor(private readonly documents: readonly SourceDocument[]) {}

  async capability(): Promise<SourceCapability> {
    return { available: true };
  }

  protected collectDocuments(): readonly SourceDocument[] {
    return this.documents;
  }
}

export class StrictSecSourceFake
  extends StrictDocumentSourceFake
  implements SecSourcePort
{
  async collect(
    request: SecCollectionRequest,
  ): Promise<readonly SourceDocument[]> {
    void request;
    return this.collectDocuments();
  }
}

export class StrictMacroSourceFake
  extends StrictDocumentSourceFake
  implements MacroSourcePort
{
  async collect(
    request: MacroCollectionRequest,
  ): Promise<readonly SourceDocument[]> {
    void request;
    return this.collectDocuments();
  }
}

export class StrictSnapshotClockFake implements SnapshotClockPort {
  constructor(private readonly timestamp: string) {}

  now(): string {
    return this.timestamp;
  }
}

export class StrictCapacityProbeFake implements DiskCapacityProbePort {
  constructor(private readonly availableBytes: number) {}

  async inspect(requiredBytes: number): Promise<CapacitySnapshot> {
    return {
      availableBytes: this.availableBytes,
      requiredBytes,
      sufficient: this.availableBytes >= requiredBytes,
    };
  }
}

export class StrictCancellationSignalFake implements CancellationSignalPort {
  private readonly listeners = new Set<() => void>();
  cancelled = false;
  reason?: string;

  onCancelled(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  cancel(reason: string): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.reason = reason;
    for (const listener of this.listeners) listener();
  }
}

export class StrictCodexRunnerFake implements CodexRunnerPort {
  invocationCount = 0;

  async run(request: CodexRunRequest): Promise<CodexRunResult> {
    this.invocationCount += 1;
    return request.cancellation.cancelled
      ? { status: "cancelled", exitCode: null }
      : { status: "succeeded", output: request.input.slice(), exitCode: 0 };
  }
}

export class StrictPublicEventNotifierFake implements PublicEventNotifierPort {
  readonly events: PublicResearchEvent[] = [];

  async notify(runId: RunId, event: PublicResearchEvent): Promise<void> {
    if (runId !== event.runId) throw new RangeError("run identity mismatch");
    this.events.push(event);
  }
}
