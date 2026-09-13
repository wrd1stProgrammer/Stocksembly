import { z } from "zod";
import { BlindChallengeOutputSchema } from "../domain/agentOutputs";
import { hashBytes } from "../domain/contractHelpers";
import { ArtifactIdSchema } from "../domain/ids";
import type { ArtifactCasPort } from "../ports/artifacts";
import { ArtifactDigestSchema } from "../ports/artifacts";
import type { ResearchDatabase } from "../server/persistence/postgres/database";

const CommitRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  logical_artifact_key: z.string().regex(/^challenge:[a-z_]+$/),
  content_hash: ArtifactDigestSchema,
});
const EnvelopeSchema = z
  .object({ payload: BlindChallengeOutputSchema })
  .passthrough();
const ParentRowSchema = z.object({
  logical_artifact_key: z.string().regex(/^challenge:[a-z_]+$/),
  parent_artifact_id: ArtifactIdSchema,
});

export async function committedChallengeArtifacts(
  database: ResearchDatabase,
  cas: ArtifactCasPort,
) {
  const commits = (
    await database.query(
      "SELECT agent_output_commits.artifact_id,\n      attempts.logical_artifact_key, artifacts.content_hash\n      FROM agent_output_commits JOIN attempts USING (attempt_id)\n      JOIN artifacts ON artifacts.artifact_id = agent_output_commits.artifact_id\n      WHERE attempts.logical_artifact_key LIKE 'challenge:%'\n      ORDER BY attempts.logical_artifact_key",
      [],
    )
  ).rows.map((row) => CommitRowSchema.parse(row));
  const parents = (
    await database.query(
      "SELECT child.logical_key AS logical_artifact_key,\n      parent.artifact_id AS parent_artifact_id FROM artifact_edges\n      JOIN artifacts AS child ON child.artifact_id = artifact_edges.child_artifact_id\n      JOIN artifacts AS parent ON parent.artifact_id = artifact_edges.parent_artifact_id\n      WHERE child.logical_key LIKE 'challenge:%'\n      ORDER BY child.logical_key, parent.artifact_id",
      [],
    )
  ).rows.map((row) => ParentRowSchema.parse(row));

  const artifacts = [];
  for (const commit of commits) {
    const read = await cas.get(commit.content_hash);
    if (read === undefined || hashBytes(read.bytes) !== commit.content_hash)
      throw new TypeError("committed challenge CAS artifact is unavailable");
    const envelope = EnvelopeSchema.parse(
      JSON.parse(new TextDecoder().decode(read.bytes)),
    );
    artifacts.push({
      logicalArtifactId: commit.logical_artifact_key,
      artifactId: commit.artifact_id,
      payload: envelope.payload,
      parentArtifactIds: parents
        .filter(
          (parent) =>
            parent.logical_artifact_key === commit.logical_artifact_key,
        )
        .map((parent) => parent.parent_artifact_id),
    });
  }
  return artifacts;
}
