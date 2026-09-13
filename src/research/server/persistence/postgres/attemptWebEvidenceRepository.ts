import type { ArtifactDescriptor } from "../../../ports/artifacts";
import type { LaunchReservationClaim } from "../../codex/codexReservation";
import { type ResearchDatabase, researchTransaction } from "./database";
export type RegisteredWebEvidence = {
  readonly descriptor: ArtifactDescriptor;
  readonly url: string;
  readonly title: string;
  readonly publisher: string;
  readonly retrievedAt: string;
  readonly excerpt: string;
};
export async function registerAttemptWebEvidence(
  database: ResearchDatabase,
  input: {
    readonly claim: LaunchReservationClaim;
    readonly transcriptHash: string;
    readonly now: string;
    readonly artifacts: readonly RegisteredWebEvidence[];
  },
): Promise<boolean> {
  return researchTransaction(database, async (database) => {
    const active = (
      await database.query(
        `SELECT 1 FROM research.attempts
        JOIN research.jobs ON jobs.job_id = attempts.job_id
        LEFT JOIN research.research_call_ordinals ON research_call_ordinals.attempt_id = attempts.attempt_id
        LEFT JOIN research.question_call_ordinals ON question_call_ordinals.attempt_id = attempts.attempt_id
        WHERE attempts.run_id = $1
          AND attempts.job_id = $2
          AND attempts.attempt_id = $3
          AND COALESCE(
            research_call_ordinals.ordinal,
            question_call_ordinals.ordinal
          ) = $4
          AND attempts.status = 'running'
          AND jobs.status = 'running'
          AND jobs.lease_owner = $5
          AND jobs.lease_token = $6
          AND jobs.lease_expires_at > $7`,
        [
          input.claim.key.runId,
          input.claim.key.jobId,
          input.claim.key.attemptId,
          input.claim.key.ordinal,
          input.claim.fence.ownerId,
          input.claim.fence.token,
          input.now,
        ],
      )
    ).rows[0];
    if (active === undefined) return false;
    for (const artifact of input.artifacts) {
      await database.query(
        `INSERT INTO research.artifacts(
          artifact_id, run_id, snapshot_id, content_hash, byte_length,
          media_type, logical_key, input_hash, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9
        )`,
        [
          artifact.descriptor.artifactId,
          artifact.descriptor.runId,
          artifact.descriptor.snapshotId,
          artifact.descriptor.digest,
          artifact.descriptor.byteLength,
          artifact.descriptor.mediaType,
          `web:${input.claim.key.attemptId}:${artifact.descriptor.artifactId}`,
          input.transcriptHash,
          artifact.retrievedAt,
        ],
      );
      await database.query(
        `INSERT INTO research.artifact_citation_metadata(
          artifact_id, locator_json
        ) VALUES ($1, $2)`,
        [
          artifact.descriptor.artifactId,
          JSON.stringify({
            kind: "captured_web",
            source: "captured_web",
            sourceUrl: artifact.url,
            title: artifact.title,
            publisher: artifact.publisher,
          }),
        ],
      );
      await database.query(
        `INSERT INTO research.attempt_web_evidence(
          attempt_id, artifact_id, tool_transcript_hash, source_url,
          title, publisher, retrieved_at, excerpt
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8
        )`,
        [
          input.claim.key.attemptId,
          artifact.descriptor.artifactId,
          input.transcriptHash,
          artifact.url,
          artifact.title,
          artifact.publisher,
          artifact.retrievedAt,
          artifact.excerpt,
        ],
      );
    }
    return true;
  });
}
