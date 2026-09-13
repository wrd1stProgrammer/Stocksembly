import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  ArtifactIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../src/research/domain/ids";
import { ArtifactDigestSchema } from "../../src/research/ports/artifacts";
import {
  resolveArtifactBlobPath,
  resolveStocksemblyDataDirectory,
} from "../../src/research/server/artifacts/filesystemArtifactPaths";
import { createLiveS3ArtifactArchive } from "../../src/research/server/artifacts/s3ArtifactArchive";
import {
  closeResearchPool,
  getResearchPool,
} from "../../src/research/server/persistence/postgres/researchPool";

async function main() {
  const commit = process.argv.includes("--commit");
  if (process.argv.includes("--help")) {
    console.log(
      "Reconcile all PostgreSQL artifact digests with private S3. Default verifies; --commit uploads missing verified local objects. Never deletes or overwrites objects.",
    );
    return;
  }
  const archive = createLiveS3ArtifactArchive();
  if (!archive)
    throw new Error("S3 artifact bucket and AWS region are required");
  let verified = 0;
  let uploaded = 0;
  let missing = 0;
  try {
    const pool = await getResearchPool();
    const rows = (
      await pool.query(
        "SELECT DISTINCT ON (content_hash) artifact_id,run_id,snapshot_id,content_hash,byte_length,media_type FROM artifacts ORDER BY content_hash,created_at DESC",
      )
    ).rows;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (cursor < rows.length) {
          const row = rows[cursor++];
          const digest = ArtifactDigestSchema.parse(row.content_hash);
          const remote = await archive.get(digest);
          if (remote !== undefined) {
            if (remote.byteLength !== Number(row.byte_length))
              throw new Error("S3 artifact length mismatch");
            verified++;
            continue;
          }
          missing++;
          if (!commit) continue;
          const bytes = await readFile(
            resolveArtifactBlobPath(resolveStocksemblyDataDirectory(), digest),
          );
          if (
            bytes.byteLength !== Number(row.byte_length) ||
            createHash("sha256").update(bytes).digest("hex") !== digest
          )
            throw new Error("Local artifact integrity mismatch");
          await archive.put(
            {
              artifactId: ArtifactIdSchema.parse(row.artifact_id),
              runId: RunIdSchema.parse(row.run_id),
              snapshotId: SnapshotIdSchema.parse(row.snapshot_id),
              digest,
              byteLength: bytes.byteLength,
              mediaType: row.media_type,
              parentDigests: [],
            },
            bytes,
          );
          const confirmed = await archive.get(digest);
          if (confirmed?.byteLength !== bytes.byteLength)
            throw new Error("Uploaded artifact verification failed");
          uploaded++;
        }
      }),
    );
    console.log(
      JSON.stringify({
        total: rows.length,
        verified,
        uploaded,
        missing,
        complete: verified + uploaded === rows.length,
      }),
    );
    if (verified + uploaded !== rows.length) process.exitCode = 1;
  } finally {
    archive.close();
    await closeResearchPool();
  }
}
await main();
