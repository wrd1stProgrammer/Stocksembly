import { describe, expect, it } from "vitest";
import {
  FollowupJobPromptSchema,
  PersistedFollowupResponseJobSchema,
} from "./followupAndResponseRoundContracts";
import { inspectFollowupCandidate } from "./followupAndResponseRoundOutput";

const challengeArtifactId = "00000000-0000-4000-8000-000000000101";
const evidenceArtifactId = "00000000-0000-4000-8000-000000000102";

describe("follow-up output inspection", () => {
  it("restores the prompt-bound challenge source when the model echoes only evidence ids", () => {
    const prompt = FollowupJobPromptSchema.parse({
      kind: "bounded_followup_input_v1",
      requestId: "00000000-0000-4000-8000-000000000103",
      actorId: "financial",
      targetClaimId: "00000000-0000-4000-8000-000000000104",
      requestKind: "source_scope_clarification",
      sourceArtifactIds: [challengeArtifactId, evidenceArtifactId],
      evidenceArtifactIds: [evidenceArtifactId],
    });
    const job = PersistedFollowupResponseJobSchema.parse({
      runId: "00000000-0000-4000-8000-000000000105",
      snapshotId: "00000000-0000-4000-8000-000000000106",
      jobId: "00000000-0000-4000-8000-000000000107",
      logicalArtifactId: "followup:financial",
      stage: "follow_up",
      prompt: JSON.stringify(prompt),
      inputHash: "a".repeat(64),
      inputManifestHash: "b".repeat(64),
      citableArtifactIds: [challengeArtifactId, evidenceArtifactId],
    });

    const inspected = inspectFollowupCandidate(job, {
      kind: "follow_up",
      sourceArtifactIds: [evidenceArtifactId],
      requestId: prompt.requestId,
      publicAnswer: {
        en: "Evidence narrows the claim.",
        ko: "근거가 주장의 범위를 좁힙니다.",
      },
      evidenceArtifactIds: [evidenceArtifactId],
      unresolved: [],
    });

    expect(inspected?.sourceArtifactIds).toEqual([
      challengeArtifactId,
      evidenceArtifactId,
    ]);
  });
});
