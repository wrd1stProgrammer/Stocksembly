import { join } from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import { LIMITS } from "../../domain/limits.constants";
import { type ResearchReport, ResearchReportSchema } from "../../domain/report";
import { parseStoredResearchReport } from "../../domain/reportStorage";
import { ArtifactDigestSchema } from "../../ports/artifacts";
import { inspectBlob } from "../artifacts/filesystemArtifactFiles";
import {
  isMissing,
  resolveArtifactBlobPath,
} from "../artifacts/filesystemArtifactPaths";
import { parseDepartmentMarketSnapshot } from "../persistence/sqlite/publishDepartmentReportForRun";
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

const QuoteArtifactRowSchema = z.object({
  artifact_id: z.string().uuid(),
  content_hash: ArtifactDigestSchema,
  locator_json: z.string(),
});

async function restoreDepartmentMarketSnapshot(
  options: ResearchReportReaderOptions,
  report: ResearchReport,
): Promise<ResearchReport> {
  if (
    report.researchTarget.kind !== "department" ||
    report.marketSnapshot !== undefined
  )
    return report;
  let row: z.infer<typeof QuoteArtifactRowSchema> | undefined;
  try {
    const database = new Database(join(options.dataRoot, "research.sqlite"), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      row = QuoteArtifactRowSchema.optional().parse(
        database
          .prepare(`SELECT artifacts.artifact_id, artifacts.content_hash,
            artifact_citation_metadata.locator_json
            FROM artifacts JOIN artifact_citation_metadata USING(artifact_id)
            WHERE artifacts.run_id = ?
              AND artifacts.logical_key = 'evidence:insightsentry:quote'
            LIMIT 1`)
          .get(report.runId),
      );
    } finally {
      database.close();
    }
  } catch {
    return report;
  }
  if (row === undefined) return report;

  let bytes: Uint8Array;
  try {
    const artifact = await inspectBlob(
      resolveArtifactBlobPath(options.dataRoot, row.content_hash),
      true,
      LIMITS.source.maxFinalPayloadBytes,
    );
    if (artifact.digest !== row.content_hash) return report;
    bytes = artifact.bytes;
  } catch (error) {
    if (!isMissing(error)) return report;
    const remote = await options.remoteArtifacts?.get(row.content_hash);
    if (
      remote === undefined ||
      remote.byteLength > LIMITS.source.maxFinalPayloadBytes
    )
      return report;
    bytes = remote;
  }
  const marketSnapshot = parseDepartmentMarketSnapshot(
    JSON.parse(row.locator_json),
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (marketSnapshot === undefined) return report;
  return ResearchReportSchema.parse({
    ...report,
    marketSnapshot,
    capabilities: [
      ...report.capabilities.filter(
        (capability) => capability.key !== "current_market_data",
      ),
      { key: "current_market_data", availability: "available" },
    ],
    limitations: report.limitations.filter(
      (limitation) => limitation.capability !== "current_market_data",
    ),
  });
}

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
  const storedReport = parseStoredResearchReport(decoded);
  const report = await restoreDepartmentMarketSnapshot(options, storedReport);
  return report.reportId === publication.reportId &&
    report.versionId === publication.versionId &&
    report.version === publication.version &&
    report.runId === publication.runId &&
    report.snapshotId === publication.snapshotId &&
    report.status === publication.status
    ? report
    : undefined;
}
