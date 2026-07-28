import { BlindChallengeOutputSchema } from "../domain/agentOutputs";
import type { PersistedChallengeJob } from "./challengeRoundContracts";
import {
  ChallengeDecisionSchema,
  ChallengeJobPromptSchema,
} from "./challengeRoundContracts";

type ChallengeCandidate = ReturnType<typeof BlindChallengeOutputSchema.parse>;

const PUBLIC_TEXT_LIMIT = 4_000;

function unicodePrefix(value: string, codeUnitLimit: number): string {
  let length = 0;
  let result = "";
  for (const character of value) {
    if (length + character.length > codeUnitLimit) break;
    result += character;
    length += character.length;
  }
  return result;
}

function renderSourceBackedChallenge(
  counterpoint: string,
  target: string,
  labels: { readonly counterpoint: string; readonly target: string },
): string {
  const available =
    PUBLIC_TEXT_LIMIT - labels.counterpoint.length - labels.target.length;
  const counterBudget = Math.floor(available / 2);
  let counter = unicodePrefix(counterpoint, counterBudget);
  const targetText = unicodePrefix(target, available - counter.length);
  const remaining = available - counter.length - targetText.length;
  if (remaining > 0)
    counter = unicodePrefix(counterpoint, counter.length + remaining);
  return `${labels.counterpoint}${counter}${labels.target}${targetText}`;
}

export function inspectChallengeCandidate(
  job: PersistedChallengeJob,
  candidateInput: unknown,
): ChallengeCandidate | undefined {
  const parsed = ChallengeDecisionSchema.safeParse(candidateInput);
  if (!parsed.success) return undefined;
  const request = ChallengeJobPromptSchema.parse(JSON.parse(job.prompt));
  const candidate = parsed.data;
  const followup =
    candidate.followupRequest === null
      ? null
      : {
          ...candidate.followupRequest,
          targetClaimId: request.target.claimId,
          evidenceArtifactIds:
            request.target.candidateCounterevidenceArtifactIds,
        };
  const publicChallenge = {
    en: renderSourceBackedChallenge(
      request.counterpoint.publicSummary.en,
      request.target.publicSummary.en,
      {
        counterpoint: "Counterpoint: ",
        target: " Target under challenge: ",
      },
    ),
    ko: renderSourceBackedChallenge(
      request.counterpoint.publicSummary.ko,
      request.target.publicSummary.ko,
      { counterpoint: "반론: ", target: " 검토 대상: " },
    ),
  };
  return BlindChallengeOutputSchema.safeParse({
    ...candidate,
    sourceArtifactIds: request.sourceArtifactIds,
    challengedClaimIds: [request.target.claimId],
    publicChallenge,
    evidenceArtifactIds: request.target.candidateCounterevidenceArtifactIds,
    materiality: request.target.materiality,
    followupRequest: followup,
  }).data;
}
