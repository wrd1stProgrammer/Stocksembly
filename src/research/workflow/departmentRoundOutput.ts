import { DepartmentConsolidationOutputSchema } from "../domain/agentOutputs";
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

export function inspectDepartmentCandidate(
  job: PersistedDepartmentJob,
  candidateInput: unknown,
): DepartmentCandidate | undefined {
  const parsed = DepartmentConsolidationOutputSchema.safeParse(candidateInput);
  const request = DepartmentJobPromptSchema.parse(JSON.parse(job.prompt));
  if (!parsed.success) return undefined;
  const candidate = parsed.data;
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
  const claimLists = [
    candidate.agreementClaimIds,
    candidate.disagreementClaimIds,
    candidate.acceptedClaimIds,
    candidate.strongestClaimIds,
    candidate.weakestClaimIds,
    candidate.revisedClaimIds,
    candidate.removedClaimIds,
  ];
  if (claimLists.flat().some((claimId) => !allowedClaims.has(claimId)))
    return undefined;
  const expectedSources = request.memberArtifacts.map(
    (member) => member.artifactId,
  );
  const requiredDissent = request.memberArtifacts.flatMap((member) => [
    ...member.memo.dissent.map((item) => item.claimId),
    ...member.memo.positions.flatMap((position) =>
      position.stance === "opposes" ? [position.claimId] : [],
    ),
  ]);
  const sourceUnknowns = request.memberArtifacts.flatMap(
    (member) => member.memo.unknowns,
  );
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
  const dissentSummaries = new Map(
    request.memberArtifacts.flatMap((member) =>
      member.memo.dissent.map(
        (item) => [item.claimId, item.publicSummary] as const,
      ),
    ),
  );
  const strongestClaimId =
    candidate.strongestClaimIds.find((claimId) => allowedClaims.has(claimId)) ??
    claims[0];
  if (strongestClaimId === undefined) return undefined;
  const canonicalSummary = positionSummaries.get(strongestClaimId);
  if (canonicalSummary === undefined) return undefined;
  const canonicalDissent = [...new Set(requiredDissent)].map((claimId) => {
    const publicSummary =
      dissentSummaries.get(claimId) ?? positionSummaries.get(claimId);
    return publicSummary === undefined ? undefined : { claimId, publicSummary };
  });
  if (canonicalDissent.some((item) => item === undefined)) return undefined;
  const disagreementClaimIds = [
    ...new Set([...candidate.disagreementClaimIds, ...requiredDissent]),
  ];
  const evidencePriorityArtifactIds = candidate.evidencePriorityArtifactIds
    .filter((id) => allowedEvidence.has(id))
    .concat(positionEvidence.get(strongestClaimId) ?? [])
    .filter((id, index, ids) => ids.indexOf(id) === index);
  const weakestClaimIds = candidate.weakestClaimIds.filter(
    (claimId) => claimId !== strongestClaimId,
  );
  const canonicalCandidate = DepartmentConsolidationOutputSchema.parse({
    ...candidate,
    sourceArtifactIds: expectedSources,
    agreementClaimIds: candidate.agreementClaimIds.filter(
      (claimId) => !disagreementClaimIds.includes(claimId),
    ),
    disagreementClaimIds,
    acceptedClaimIds: claims,
    strongestClaimIds: [strongestClaimId],
    weakestClaimIds:
      weakestClaimIds.length > 0
        ? weakestClaimIds
        : [
            claims.find((claimId) => claimId !== strongestClaimId) ??
              strongestClaimId,
          ],
    revisedClaimIds: [],
    removedClaimIds: [],
    publicSummary: canonicalSummary,
    dissent: canonicalDissent,
    openQuestions: sourceUnknowns,
    evidencePriorityArtifactIds,
  });
  const text = publicTexts(canonicalCandidate).join(" ");
  if (absentAliases.some((alias) => attributesSpeech(text, alias)))
    return undefined;
  if (!hasOnlyGroundedNumbers(publicTexts(canonicalCandidate), memberTexts))
    return undefined;
  return canonicalCandidate;
}
