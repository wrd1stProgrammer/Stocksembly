import type { AgentOutputCandidate } from "../domain/agentOutputs";
import { assertNever } from "../domain/ids";

export type PublicArtifactEventFields = {
  readonly summary: { readonly en: string; readonly ko: string };
  readonly claimIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly limitationIds: readonly string[];
};

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function limitationId(
  kind: AgentOutputCandidate["kind"],
  text: { readonly en: string; readonly ko: string },
): string {
  let hash = 2_166_136_261;
  for (const character of `${kind}\u0000${text.en}\u0000${text.ko}`)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  return `limitation:${kind}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function publicArtifactEventFields(
  payload: AgentOutputCandidate,
): PublicArtifactEventFields {
  switch (payload.kind) {
    case "memo":
      return fields(
        first(payload.positions).publicSummary,
        [
          ...payload.positions.map((position) => position.claimId),
          ...payload.dissent.map((item) => item.claimId),
        ],
        [
          ...payload.sourceArtifactIds,
          ...payload.positions.flatMap(
            (position) => position.evidenceArtifactIds,
          ),
        ],
        payload.unknowns.map((item) => limitationId(payload.kind, item)),
      );
    case "department_consolidation":
      return fields(
        payload.publicSummary,
        [
          ...payload.acceptedClaimIds,
          ...payload.disagreementClaimIds,
          ...payload.dissent.map((item) => item.claimId),
        ],
        [...payload.sourceArtifactIds, ...payload.evidencePriorityArtifactIds],
        payload.openQuestions.map((item) => limitationId(payload.kind, item)),
      );
    case "blind_challenge":
      return fields(
        payload.publicChallenge,
        payload.challengedClaimIds,
        [...payload.sourceArtifactIds, ...payload.evidenceArtifactIds],
        [],
      );
    case "owner_response_ballot":
      return fields(
        first(payload.dispositions).publicRationale,
        [
          ...payload.dispositions.map((item) => item.claimId),
          ...payload.ballot.rationaleClaimIds,
          ...payload.dissent.map((item) => item.claimId),
        ],
        payload.sourceArtifactIds,
        payload.unresolvedConditions.map((item) =>
          limitationId(payload.kind, item),
        ),
      );
    case "follow_up":
      return fields(
        payload.publicAnswer,
        [],
        [...payload.sourceArtifactIds, ...payload.evidenceArtifactIds],
        payload.unresolved.map((item) => limitationId(payload.kind, item)),
      );
    case "semantic_audit":
      return fields(
        first(payload.verdicts).publicExplanation,
        [
          ...payload.verdicts.map((verdict) => verdict.claimId),
          ...payload.questionCoverage.flatMap((coverage) => coverage.claimIds),
        ],
        [
          ...payload.sourceArtifactIds,
          ...payload.verdicts.flatMap((verdict) => verdict.evidenceArtifactIds),
        ],
        [],
      );
    case "chair_synthesis":
      return fields(
        first(payload.sections).publicSummary,
        [
          ...payload.sections.flatMap((section) => section.auditedClaimIds),
          ...payload.dissentClaimIds,
        ],
        [
          ...payload.sourceArtifactIds,
          ...payload.sections.flatMap((section) => section.sourceArtifactIds),
          ...payload.ballotArtifactIds,
        ],
        payload.unknowns.map((item) => limitationId(payload.kind, item)),
      );
    default:
      return assertNever(payload);
  }
}

function fields(
  summary: { readonly en: string; readonly ko: string },
  claimIds: readonly string[],
  sourceIds: readonly string[],
  limitationIds: readonly string[],
): PublicArtifactEventFields {
  return Object.freeze({
    summary: Object.freeze({ ...summary }),
    claimIds: unique(claimIds),
    sourceIds: unique(sourceIds),
    limitationIds: unique(limitationIds),
  });
}

export const publicArtifactFields = publicArtifactEventFields;

function first<T>(values: readonly T[]): T {
  const value = values.at(0);
  if (value === undefined)
    throw new RangeError("accepted agent output has no public summary");
  return value;
}
