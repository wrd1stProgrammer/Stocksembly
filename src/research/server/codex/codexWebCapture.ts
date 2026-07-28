import type { SnapshotId } from "../../domain/ids";
import { ArtifactIdSchema } from "../../domain/ids";
import type { ArtifactCasPort } from "../../ports/artifacts";
import type { RegisteredWebEvidence } from "../persistence/sqlite/attemptWebEvidenceRepository";
import type { AttemptWebEvidenceCapture } from "./codexTypes";

type AttemptWebEvidenceRegistrar = {
  readonly registerAttemptWebEvidence: (input: {
    readonly claim: AttemptWebEvidenceCapture["reservation"];
    readonly transcriptHash: string;
    readonly now: string;
    readonly artifacts: readonly RegisteredWebEvidence[];
  }) => boolean;
};

export async function captureAttemptWebEvidence(
  cas: ArtifactCasPort,
  registrar: AttemptWebEvidenceRegistrar,
  snapshotId: SnapshotId,
  now: string,
  input: AttemptWebEvidenceCapture,
): Promise<boolean> {
  const registered: RegisteredWebEvidence[] = [];
  for (let offset = 0; offset < input.artifacts.length; offset += 2) {
    const batch = input.artifacts.slice(offset, offset + 2);
    const captured = await Promise.all(
      batch.map(async (artifact) => ({
        descriptor: await cas.put({
          artifactId: ArtifactIdSchema.parse(artifact.artifactId),
          runId: input.reservation.key.runId,
          snapshotId,
          mediaType: "application/vnd.stocksembly.web-capture",
          parentDigests: [],
          bytes: artifact.content,
        }),
        url: artifact.url,
        title: artifact.title,
        publisher: artifact.publisher,
        retrievedAt: artifact.retrievedAt,
        excerpt: artifact.excerpt,
      })),
    );
    registered.push(...captured);
  }
  return registrar.registerAttemptWebEvidence({
    claim: input.reservation,
    transcriptHash: input.transcriptHash,
    now,
    artifacts: registered,
  });
}
