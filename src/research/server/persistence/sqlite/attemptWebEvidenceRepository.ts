import type Database from "better-sqlite3";
import type { ArtifactDescriptor } from "../../../ports/artifacts";
import type { LaunchReservationClaim } from "../../codex/codexReservation";

export type RegisteredWebEvidence = {
  readonly descriptor: ArtifactDescriptor;
  readonly url: string;
  readonly title: string;
  readonly publisher: string;
  readonly retrievedAt: string;
  readonly excerpt: string;
};

export function registerAttemptWebEvidence(
  database: Database.Database,
  input: {
    readonly claim: LaunchReservationClaim;
    readonly transcriptHash: string;
    readonly now: string;
    readonly artifacts: readonly RegisteredWebEvidence[];
  },
): boolean {
  return database.transaction(() => {
    const active = database
      .prepare(`SELECT 1 FROM attempts
        JOIN jobs USING (job_id)
        LEFT JOIN research_call_ordinals USING (attempt_id)
        LEFT JOIN question_call_ordinals USING (attempt_id)
        WHERE attempts.run_id = @runId
          AND attempts.job_id = @jobId
          AND attempts.attempt_id = @attemptId
          AND COALESCE(
            research_call_ordinals.ordinal,
            question_call_ordinals.ordinal
          ) = @ordinal
          AND attempts.status = 'running'
          AND jobs.status = 'running'
          AND jobs.lease_owner = @ownerId
          AND jobs.lease_token = @token
          AND jobs.lease_expires_at > @now`)
      .get({
        ...input.claim.key,
        ...input.claim.fence,
        now: input.now,
      });
    if (active === undefined) return false;
    for (const artifact of input.artifacts) {
      database
        .prepare(`INSERT INTO artifacts(
          artifact_id, run_id, snapshot_id, content_hash, byte_length,
          media_type, logical_key, input_hash, created_at
        ) VALUES (
          @artifactId, @runId, @snapshotId, @contentHash, @byteLength,
          @mediaType, @logicalKey, @inputHash, @createdAt
        )`)
        .run({
          ...artifact.descriptor,
          contentHash: artifact.descriptor.digest,
          logicalKey: `web:${input.claim.key.attemptId}:${artifact.descriptor.artifactId}`,
          inputHash: input.transcriptHash,
          createdAt: artifact.retrievedAt,
        });
      database
        .prepare(`INSERT INTO artifact_citation_metadata(
          artifact_id, locator_json
        ) VALUES (@artifactId, @locatorJson)`)
        .run({
          artifactId: artifact.descriptor.artifactId,
          locatorJson: JSON.stringify({
            kind: "captured_web",
            source: "captured_web",
            sourceUrl: artifact.url,
            title: artifact.title,
            publisher: artifact.publisher,
          }),
        });
      database
        .prepare(`INSERT INTO attempt_web_evidence(
          attempt_id, artifact_id, tool_transcript_hash, source_url,
          title, publisher, retrieved_at, excerpt
        ) VALUES (
          @attemptId, @artifactId, @transcriptHash, @url,
          @title, @publisher, @retrievedAt, @excerpt
        )`)
        .run({
          attemptId: input.claim.key.attemptId,
          artifactId: artifact.descriptor.artifactId,
          transcriptHash: input.transcriptHash,
          url: artifact.url,
          title: artifact.title,
          publisher: artifact.publisher,
          retrievedAt: artifact.retrievedAt,
          excerpt: artifact.excerpt,
        });
    }
    return true;
  })();
}
