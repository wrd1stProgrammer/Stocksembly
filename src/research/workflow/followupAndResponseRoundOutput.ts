import {
  FollowUpOutputSchema,
  OwnerResponseBallotOutputSchema,
} from "../domain/agentOutputs";
import type { PersistedFollowupResponseJob } from "./followupAndResponseRoundContracts";
import {
  FollowupJobPromptSchema,
  OwnerResponseJobPromptSchema,
} from "./followupAndResponseRoundContracts";

export function inspectFollowupCandidate(
  job: PersistedFollowupResponseJob,
  input: unknown,
) {
  const candidate = FollowUpOutputSchema.safeParse(input);
  if (!candidate.success) return undefined;
  const request = FollowupJobPromptSchema.parse(JSON.parse(job.prompt));
  if (
    candidate.data.requestId !== request.requestId ||
    !candidate.data.evidenceArtifactIds.every((id) =>
      request.evidenceArtifactIds.includes(id),
    )
  )
    return undefined;
  return FollowUpOutputSchema.parse({
    ...candidate.data,
    sourceArtifactIds: request.sourceArtifactIds,
  });
}

export function inspectOwnerResponseCandidate(
  job: PersistedFollowupResponseJob,
  input: unknown,
) {
  const candidate = OwnerResponseBallotOutputSchema.safeParse(input);
  if (!candidate.success) return undefined;
  const request = OwnerResponseJobPromptSchema.parse(JSON.parse(job.prompt));
  const dispositions = request.targetClaimIds.map((claimId) => {
    const received = candidate.data.dispositions.find(
      (item) => item.claimId === claimId,
    );
    return (
      received ?? {
        claimId,
        disposition:
          candidate.data.ballot.vote === "oppose" ? "reject" : "accept",
        publicRationale: candidate.data.ballot.publicRationale,
      }
    );
  });
  return OwnerResponseBallotOutputSchema.parse({
    ...candidate.data,
    sourceArtifactIds: request.sourceArtifactIds,
    dispositions,
    ballot: {
      ...candidate.data.ballot,
      rationaleClaimIds: request.targetClaimIds,
    },
    dissent: candidate.data.dissent.filter((item) =>
      request.targetClaimIds.includes(item.claimId),
    ),
    unresolvedConditions: [
      ...request.publicUnknowns,
      ...candidate.data.unresolvedConditions,
    ].slice(0, 32),
  });
}
