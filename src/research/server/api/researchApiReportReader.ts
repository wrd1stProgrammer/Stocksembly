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
};

export async function loadPublicResearchReport(
  options: ResearchReportReaderOptions,
  publication: PublicReport,
): Promise<ResearchReport | undefined> {
  const pointer = PublicationPointerSchema.parse(publication.payload);
  if (pointer.reportArtifactDigest !== publication.artifactDigest)
    return undefined;
  let artifact: Awaited<ReturnType<typeof inspectBlob>>;
  try {
    artifact = await inspectBlob(
      resolveArtifactBlobPath(options.dataRoot, pointer.reportArtifactDigest),
      true,
      LIMITS.source.maxFinalPayloadBytes,
    );
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  if (artifact.digest !== pointer.reportArtifactDigest) return undefined;
  const decoded: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes),
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
