import { hashBytes } from "../../domain/contractHelpers";
import {
  type TechnicalChartManifest,
  type TechnicalChartSnapshot,
  TechnicalChartSnapshotSchema,
} from "../../domain/technicalChart";
import { ArtifactDigestSchema } from "../../ports/artifacts";
import { inspectBlob } from "../artifacts/filesystemArtifactFiles";
import { resolveArtifactBlobPath } from "../artifacts/filesystemArtifactPaths";
import { createLiveS3ArtifactArchive } from "../artifacts/s3ArtifactArchive";
import { prepareLiveResearchRuntime } from "./liveResearchApi";

export async function readPublishedTechnicalChart(
  manifest: TechnicalChartManifest,
): Promise<TechnicalChartSnapshot | undefined> {
  try {
    const { dataRoot } = await prepareLiveResearchRuntime();
    const digest = ArtifactDigestSchema.parse(manifest.digest);
    let bytes: Uint8Array | undefined;
    try {
      bytes = (
        await inspectBlob(
          resolveArtifactBlobPath(dataRoot, digest),
          true,
          2_000_000,
        )
      ).bytes;
    } catch {
      bytes = await createLiveS3ArtifactArchive()?.get(digest);
    }
    if (!bytes || bytes.byteLength > 2_000_000 || hashBytes(bytes) !== digest)
      return undefined;
    const parsed = TechnicalChartSnapshotSchema.safeParse(
      JSON.parse(new TextDecoder().decode(bytes)),
    );
    return parsed.success &&
      parsed.data.analysisAsOf === manifest.analysisAsOf &&
      parsed.data.status === manifest.status
      ? parsed.data
      : undefined;
  } catch {
    return undefined;
  }
}
