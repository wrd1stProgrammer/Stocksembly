import { DepartmentConsolidationOutputSchema } from "../domain/agentOutputs";
import { hashCanonical } from "../domain/contractHelpers";
import { normalizeEditorialText } from "../domain/editorialQuality";
import { ClaimIdSchema } from "../domain/ids";
import { WORKFLOW_V1_ATTRIBUTION_ALIASES } from "../domain/roleAliases";
import type { WorkflowRoleId } from "../domain/roleRegistry";
import type { PersistedDepartmentJob } from "./departmentRoundContracts";
import { DepartmentJobPromptSchema } from "./departmentRoundContracts";

type DepartmentCandidate = ReturnType<
  typeof DepartmentConsolidationOutputSchema.parse
>;

function publicTexts(candidate: DepartmentCandidate): readonly string[] {
  return [
    candidate.publicSummary.en,
    candidate.publicSummary.ko,
    ...candidate.dissent.flatMap((item) => [
      item.publicSummary.en,
      item.publicSummary.ko,
    ]),
    ...candidate.openQuestions.flatMap((item) => [item.en, item.ko]),
    ...candidate.dispositions.flatMap((item) => [item.reason.en, item.reason.ko]),
    ...candidate.revisions.flatMap((item) => [
      item.publicSummary.en,
      item.publicSummary.ko,
      item.falsifier.en,
      item.falsifier.ko,
      item.reason.en,
      item.reason.ko,
    ]),
  ];
}

function numericTokens(texts: readonly string[]): ReadonlySet<string> {
  return new Set(
    texts.flatMap((text) => text.match(/\d+(?:[.,]\d+)*/gu) ?? []),
  );
}

export function hasOnlyGroundedNumbers(
  candidateTexts: readonly string[],
  sourceTexts: readonly string[],
): boolean {
  const supportedNumbers = new Set(
    [...numericTokens(sourceTexts)].flatMap((token) => {
      const value = Number(token.replaceAll(",", ""));
      return Number.isFinite(value)
        ? [String(value), String(Math.round(value))]
        : [token];
    }),
  );
  return [...numericTokens(candidateTexts)].every((token) => {
    const value = Number(token.replaceAll(",", ""));
    return supportedNumbers.has(Number.isFinite(value) ? String(value) : token);
  });
}

function attributesSpeech(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const leadingBoundary = "(?:^|[^\\p{L}\\p{N}_])";
  const trailingBoundary = "(?=$|[^\\p{L}\\p{N}_])";
  const aliasToken = `${leadingBoundary}${escaped}${trailingBoundary}`;
  const englishVerb =
    "(?:said|says|argued|argues|noted|notes|reported|reports|claimed|claims)";
  const englishAttribution = new RegExp(
    `(?:${aliasToken}[\\s,;:\\-—]+${englishVerb}\\b|\\baccording\\s+to\\s+(?:the\\s+)?${aliasToken})`,
    "iu",
  );
  const koreanVerb =
    "(?:말했다|말한다|주장했다|주장한다|언급했다|언급한다|보고했다|보고한다|밝혔다|밝힌다|설명했다|설명한다)";
  const koreanAttribution = new RegExp(
    `${leadingBoundary}${escaped}(?:(?:은|는|이|가|께서)[^.!?。！？\\n]{0,40}${koreanVerb}|(?:에\\s*따르면|의\\s+말에\\s+따르면))${trailingBoundary}`,
    "iu",
  );
  return englishAttribution.test(text) || koreanAttribution.test(text);
}

function sameSet(expected: readonly string[], received: readonly string[]) {
  return (
    expected.length === received.length &&
    new Set(received).size === received.length &&
    expected.every((value) => received.includes(value))
  );
}

function sameText(
  left: { readonly en: string; readonly ko: string },
  right: { readonly en: string; readonly ko: string },
) {
  return left.en === right.en && left.ko === right.ko;
}

function adjudicatedUuid(hash: string): string {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function adjudicatedClaimIdForRevision(revision: {
  readonly originClaimId: string;
  readonly publicSummary: { readonly en: string; readonly ko: string };
  readonly falsifier: { readonly en: string; readonly ko: string };
  readonly reason: { readonly en: string; readonly ko: string };
  readonly sourceArtifactIds: readonly string[];
}) {
  return ClaimIdSchema.parse(
    adjudicatedUuid(
      hashCanonical({
        originClaimId: revision.originClaimId,
        publicSummary: revision.publicSummary,
        falsifier: revision.falsifier,
        reason: revision.reason,
        sourceArtifactIds: revision.sourceArtifactIds,
      }),
    ),
  );
}

export function inspectDepartmentCandidate(
  job: PersistedDepartmentJob,
  candidateInput: unknown,
): DepartmentCandidate | undefined {
  const parsed = DepartmentConsolidationOutputSchema.safeParse(candidateInput);
  const request = DepartmentJobPromptSchema.parse(JSON.parse(job.prompt));
  if (!parsed.success) return undefined;
  const candidate = parsed.data;
  if (candidate.openQuestions.length > 2) return undefined;
  const claims = [
    ...new Set(
      request.memberArtifacts.flatMap((member) =>
        member.memo.positions.map((position) => position.claimId),
      ),
    ),
  ];
  const allowedClaims = new Set(claims);
  const allowedEvidence = new Set(
    request.memberArtifacts.flatMap((member) =>
      member.memo.positions.flatMap((position) => position.evidenceArtifactIds),
    ),
  );
  const authenticatedClaimLists = [
    candidate.acceptedClaimIds,
    candidate.removedClaimIds,
  ];
  if (
    authenticatedClaimLists
      .flat()
      .some((claimId) => !allowedClaims.has(claimId))
  )
    return undefined;
  const expectedSources = request.memberArtifacts.map(
    (member) => member.artifactId,
  );
  const explicitDissentClaimIds = request.memberArtifacts.flatMap((member) =>
    member.memo.dissent.map((item) => item.claimId),
  );
  const opposingPositionClaimIds = request.memberArtifacts.flatMap((member) =>
    member.memo.positions.flatMap((position) =>
      position.stance === "opposes" ? [position.claimId] : [],
    ),
  );
  const requiredDissent = [
    ...explicitDissentClaimIds,
    ...opposingPositionClaimIds,
  ];
  const absentAliases = (
    Object.entries(WORKFLOW_V1_ATTRIBUTION_ALIASES) as readonly [
      WorkflowRoleId,
      readonly string[],
    ][]
  )
    .filter(
      ([roleId]) =>
        !request.department.memberIds.some((memberId) => memberId === roleId),
    )
    .flatMap(([, aliases]) => aliases);
  const memberTexts = request.memberArtifacts.flatMap((member) => [
    ...member.memo.positions.map((position) => position.publicSummary.en),
    ...member.memo.positions.map((position) => position.publicSummary.ko),
    ...member.memo.positions.flatMap((position) =>
      position.strongestContraryObservation === undefined
        ? []
        : [
            position.strongestContraryObservation.en,
            position.strongestContraryObservation.ko,
          ],
    ),
    ...member.memo.positions.flatMap((position) =>
      position.falsifier === undefined
        ? []
        : [position.falsifier.en, position.falsifier.ko],
    ),
    ...member.memo.dissent.map((item) => item.publicSummary.en),
    ...member.memo.dissent.map((item) => item.publicSummary.ko),
    ...member.memo.unknowns.map((item) => item.en),
    ...member.memo.unknowns.map((item) => item.ko),
  ]);
  const positionSummaries = new Map(
    request.memberArtifacts.flatMap((member) =>
      member.memo.positions.map(
        (position) => [position.claimId, position.publicSummary] as const,
      ),
    ),
  );
  const positionEvidence = new Map(
    request.memberArtifacts.flatMap((member) =>
      member.memo.positions.map(
        (position) => [position.claimId, position.evidenceArtifactIds] as const,
      ),
    ),
  );
  const positionsByClaim = new Map(
    request.memberArtifacts.flatMap((member) =>
      member.memo.positions.map((position) => [position.claimId, position] as const),
    ),
  );
  if (
    candidate.evidencePriorityArtifactIds.some(
      (artifactId) => !allowedEvidence.has(artifactId),
    )
  )
    return undefined;
  const dispositionIds = candidate.dispositions.map((item) => item.claimId);
  if (!sameSet(claims, dispositionIds)) return undefined;
  const dispositions = new Map(
    candidate.dispositions.map((item) => [item.claimId, item] as const),
  );
  const acceptedClaimIds = claims.filter(
    (claimId) => dispositions.get(claimId)?.disposition === "accept",
  );
  const revisedOriginClaimIds = claims.filter(
    (claimId) => dispositions.get(claimId)?.disposition === "revise",
  );
  const removedClaimIds = claims.filter(
    (claimId) => dispositions.get(claimId)?.disposition === "remove",
  );
  if (
    !sameSet(acceptedClaimIds, candidate.acceptedClaimIds) ||
    !sameSet(removedClaimIds, candidate.removedClaimIds)
  )
    return undefined;
  if (
    explicitDissentClaimIds.some((claimId) => removedClaimIds.includes(claimId))
  )
    return undefined;
  const removedTexts = removedClaimIds.flatMap((claimId) => {
    const summary = positionSummaries.get(claimId);
    return summary === undefined
      ? []
      : [normalizeEditorialText(summary.en), normalizeEditorialText(summary.ko)];
  });
  const retainedPublicTexts = [
    candidate.publicSummary.en,
    candidate.publicSummary.ko,
    ...candidate.openQuestions.flatMap((question) => [question.en, question.ko]),
    ...candidate.dissent.flatMap((item) => [
      item.publicSummary.en,
      item.publicSummary.ko,
    ]),
    ...candidate.revisions.flatMap((revision) => [
      revision.publicSummary.en,
      revision.publicSummary.ko,
    ]),
  ].map(normalizeEditorialText);
  if (removedTexts.some((text) => retainedPublicTexts.includes(text)))
    return undefined;
  if (candidate.revisions.length !== revisedOriginClaimIds.length)
    return undefined;
  const revisionsByOrigin = new Map(
    candidate.revisions.map((revision) => [revision.originClaimId, revision] as const),
  );
  if (
    revisionsByOrigin.size !== candidate.revisions.length ||
    revisedOriginClaimIds.some((claimId) => !revisionsByOrigin.has(claimId))
  )
    return undefined;
  const canonicalRevisions = candidate.revisions.map((revision) => {
    const sourceArtifactIds = positionEvidence.get(revision.originClaimId);
    const disposition = dispositions.get(revision.originClaimId);
    if (
      sourceArtifactIds === undefined ||
      disposition?.disposition !== "revise" ||
      !sameSet(sourceArtifactIds, revision.sourceArtifactIds) ||
      !sameText(disposition.reason, revision.reason)
    )
      return undefined;
    const canonicalRevision = {
      ...revision,
      sourceArtifactIds,
      revisionHash: hashCanonical({
        originClaimId: revision.originClaimId,
        publicSummary: revision.publicSummary,
        falsifier: revision.falsifier,
        reason: revision.reason,
        sourceArtifactIds,
      }),
      adjudicatedClaimId: adjudicatedClaimIdForRevision({
        ...revision,
        sourceArtifactIds,
      }),
    };
    if (
      revision.adjudicatedClaimId !== revision.originClaimId &&
      revision.adjudicatedClaimId !== canonicalRevision.adjudicatedClaimId
    )
      return undefined;
    return canonicalRevision;
  });
  if (canonicalRevisions.some((revision) => revision === undefined))
    return undefined;
  const adjudicatedClaimIds = canonicalRevisions.flatMap((revision) =>
    revision === undefined ? [] : [revision.adjudicatedClaimId],
  );
  if (
    new Set(adjudicatedClaimIds).size !== adjudicatedClaimIds.length ||
    adjudicatedClaimIds.some((claimId) => allowedClaims.has(claimId))
  )
    return undefined;
  const revisionOriginByReference = new Map<string, string>();
  for (const revision of canonicalRevisions) {
    if (revision === undefined) continue;
    revisionOriginByReference.set(
      revision.originClaimId,
      revision.originClaimId,
    );
    revisionOriginByReference.set(
      revision.adjudicatedClaimId,
      revision.originClaimId,
    );
  }
  const suppliedRevisedOrigins = candidate.revisedClaimIds.map((claimId) =>
    revisionOriginByReference.get(claimId),
  );
  if (
    suppliedRevisedOrigins.some((claimId) => claimId === undefined) ||
    !sameSet(
      revisedOriginClaimIds,
      suppliedRevisedOrigins.flatMap((claimId) =>
        claimId === undefined ? [] : [claimId],
      ),
    )
  )
    return undefined;
  const canonicalRevisedClaimIds = canonicalRevisions.flatMap((revision) =>
    revision === undefined ? [] : [revision.adjudicatedClaimId],
  );
  const acceptedClaimIdSet = new Set<string>(acceptedClaimIds);
  const canonicalClaimId = (claimId: string) => {
    if (acceptedClaimIdSet.has(claimId)) return ClaimIdSchema.parse(claimId);
    const originClaimId = revisionOriginByReference.get(claimId);
    return originClaimId === undefined
      ? undefined
      : canonicalRevisions.find(
          (revision) => revision?.originClaimId === originClaimId,
        )?.adjudicatedClaimId;
  };
  const strongestClaimIds = candidate.strongestClaimIds.map(canonicalClaimId);
  const weakestClaimIds = candidate.weakestClaimIds.map(canonicalClaimId);
  if (
    [...strongestClaimIds, ...weakestClaimIds].some(
      (claimId) => claimId === undefined,
    )
  )
    return undefined;
  const survivorIds = new Set([
    ...acceptedClaimIds,
    ...canonicalRevisedClaimIds,
  ]);
  if (survivorIds.size === 0) return undefined;
  const survivorFalsifiers = [
    ...acceptedClaimIds.map((claimId) => positionsByClaim.get(claimId)?.falsifier),
    ...canonicalRevisions.map((revision) => revision?.falsifier),
  ];
  if (survivorFalsifiers.some((falsifier) => falsifier === undefined))
    return undefined;
  const falsifierKeys = survivorFalsifiers.map(
    (falsifier) =>
      `${normalizeEditorialText(falsifier?.en ?? "")}\u0000${normalizeEditorialText(
        falsifier?.ko ?? "",
      )}`,
  );
  if (new Set(falsifierKeys).size !== falsifierKeys.length) return undefined;
  const dissentSummaries = new Map(
    request.memberArtifacts.flatMap((member) =>
      member.memo.dissent.map(
        (item) => [item.claimId, item.publicSummary] as const,
      ),
    ),
  );
  const strongestClaimId = strongestClaimIds[0];
  if (strongestClaimId === undefined) return undefined;
  const canonicalDissent = [...new Set(requiredDissent)]
    .filter((claimId) => !removedClaimIds.includes(claimId))
    .map((claimId) => {
      const revision = canonicalRevisions.find(
        (item) => item?.originClaimId === claimId,
      );
      const publicSummary =
        revision?.publicSummary ??
        dissentSummaries.get(claimId) ??
        positionSummaries.get(claimId);
      return publicSummary === undefined
        ? undefined
        : {
            claimId: revision?.adjudicatedClaimId ?? claimId,
            publicSummary,
          };
    });
  if (canonicalDissent.some((item) => item === undefined)) return undefined;
  const canonicalReferenceId = (claimId: string) =>
    canonicalClaimId(claimId) ?? claimId;
  const knownRelationshipReferences = new Set([
    ...claims,
    ...canonicalRevisedClaimIds,
  ]);
  if (
    [...candidate.agreementClaimIds, ...candidate.disagreementClaimIds].some(
      (claimId) => !knownRelationshipReferences.has(claimId),
    )
  )
    return undefined;
  const removedClaimIdSet = new Set<string>(removedClaimIds);
  const survivingReferenceId = (claimId: string) => {
    if (removedClaimIdSet.has(claimId)) return undefined;
    return canonicalReferenceId(claimId);
  };
  const disagreementClaimIds = [
    ...new Set(
      [...candidate.disagreementClaimIds, ...requiredDissent].flatMap(
        (claimId) => {
          const canonical = survivingReferenceId(claimId);
          return canonical === undefined ? [] : [canonical];
        },
      ),
    ),
  ];
  const canonicalCandidate = DepartmentConsolidationOutputSchema.parse({
    ...candidate,
    sourceArtifactIds: expectedSources,
    agreementClaimIds: candidate.agreementClaimIds
      .flatMap((claimId) => {
        const canonical = survivingReferenceId(claimId);
        return canonical === undefined ? [] : [canonical];
      })
      .filter((claimId) => !disagreementClaimIds.includes(claimId)),
    disagreementClaimIds,
    acceptedClaimIds,
    strongestClaimIds,
    weakestClaimIds,
    revisedClaimIds: canonicalRevisedClaimIds,
    removedClaimIds,
    dispositions: candidate.dispositions,
    revisions: canonicalRevisions,
    publicSummary: candidate.publicSummary,
    dissent: canonicalDissent,
    openQuestions: candidate.openQuestions,
    evidencePriorityArtifactIds: candidate.evidencePriorityArtifactIds,
  });
  const text = publicTexts(canonicalCandidate).join(" ");
  if (absentAliases.some((alias) => attributesSpeech(text, alias)))
    return undefined;
  if (!hasOnlyGroundedNumbers(publicTexts(canonicalCandidate), memberTexts))
    return undefined;
  return canonicalCandidate;
}
