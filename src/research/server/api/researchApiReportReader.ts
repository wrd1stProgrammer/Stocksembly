import { z } from "zod";
import { LIMITS } from "../../domain/limits.constants";
import { type ResearchReport, ResearchReportSchema } from "../../domain/report";
import { ArtifactDigestSchema } from "../../ports/artifacts";
import { inspectBlob } from "../artifacts/filesystemArtifactFiles";
import {
  isMissing,
  resolveArtifactBlobPath,
} from "../artifacts/filesystemArtifactPaths";
import type { PublicReport } from "./researchApiContracts";

const PublicationPointerSchema = z
  .object({
    schemaVersion: z.literal("workflow-v1"),
    reportArtifactDigest: ArtifactDigestSchema,
    version: z.number().int().positive(),
    priorVersionId: z.string().uuid().nullable(),
    status: z.enum(["complete", "complete_with_limitations", "incomplete"]),
    claimIds: z.array(z.string().uuid()),
    sourceIds: z.array(z.string().uuid()),
    limitationIds: z.array(z.string()),
  })
  .strict();

export type ResearchReportReaderOptions = {
  readonly dataRoot: string;
  readonly remoteArtifacts?: {
    readonly get: (
      digest: z.infer<typeof ArtifactDigestSchema>,
    ) => Promise<Uint8Array | undefined>;
  };
};

export async function loadPublicResearchReport(
  options: ResearchReportReaderOptions,
  publication: PublicReport,
): Promise<ResearchReport | undefined> {
  const pointer = PublicationPointerSchema.parse(publication.payload);
  if (pointer.reportArtifactDigest !== publication.artifactDigest)
    return undefined;
  let bytes: Uint8Array;
  try {
    const artifact = await inspectBlob(
      resolveArtifactBlobPath(options.dataRoot, pointer.reportArtifactDigest),
      true,
      LIMITS.source.maxFinalPayloadBytes,
    );
    if (artifact.digest !== pointer.reportArtifactDigest) return undefined;
    bytes = artifact.bytes;
  } catch (error) {
    if (!isMissing(error)) throw error;
    const remote = await options.remoteArtifacts?.get(
      pointer.reportArtifactDigest,
    );
    if (remote === undefined) return undefined;
    if (remote.byteLength > LIMITS.source.maxFinalPayloadBytes)
      return undefined;
    bytes = remote;
  }
  const decoded: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  const report = ResearchReportSchema.parse(decoded);
  return report.reportId === publication.reportId &&
    report.versionId === publication.versionId &&
    report.version === publication.version &&
    report.runId === publication.runId &&
    report.snapshotId === publication.snapshotId &&
    report.status === publication.status
    ? report
    : undefined;
}
