type Claim = {
  readonly claimId: string;
  readonly text?: { readonly en: string; readonly ko: string };
};
type Revision = { readonly adjudicatedClaimId: string };

export function isComparatorAbsenceThesis(text: {
  readonly en: string;
  readonly ko: string;
}): boolean {
  return (
    /(?:peer|comparator|benchmark|sector comparison|relative strength).{0,80}(?:unavailable|missing|absent|insufficient|cannot be (?:verified|confirmed|assessed))/iu.test(
      text.en,
    ) ||
    /(?:동종기업|피어|벤치마크|섹터 비교|상대 강도).{0,80}(?:없|부재|부족|불가|확인할 수 없|검증되지 않)/u.test(
      text.ko,
    )
  );
}

export function selectChairClaims<
  ClaimValue extends Claim,
  RevisionValue extends Revision,
>(input: {
  readonly structuralClaims: readonly ClaimValue[];
  readonly semanticallyAcceptedClaimIds: ReadonlySet<string>;
  readonly positionClaimIds: readonly string[];
  readonly revisions: readonly RevisionValue[];
  readonly retainedDissentClaimIds: readonly string[];
  readonly excludeComparatorAbsenceClaims?: boolean;
}) {
  const excludedClaimIds = new Set(
    input.excludeComparatorAbsenceClaims === true
      ? input.structuralClaims
          .filter(
            (claim) =>
              claim.text !== undefined && isComparatorAbsenceThesis(claim.text),
          )
          .map((claim) => claim.claimId)
      : [],
  );
  const adjudicatedClaimIds = new Set(
    input.positionClaimIds.filter((claimId) => !excludedClaimIds.has(claimId)),
  );
  const retainedDissentClaimIds = new Set(input.retainedDissentClaimIds);
  const audited = [
    ...new Map(
      input.structuralClaims
        .filter(
          (claim) =>
            !excludedClaimIds.has(claim.claimId) &&
            input.semanticallyAcceptedClaimIds.has(claim.claimId) &&
            (adjudicatedClaimIds.has(claim.claimId) ||
              retainedDissentClaimIds.has(claim.claimId)),
        )
        .map((claim) => [claim.claimId, claim]),
    ).values(),
  ];
  const authenticatedRevisions = input.revisions.filter((revision) =>
    adjudicatedClaimIds.has(revision.adjudicatedClaimId),
  );
  const auditedClaimIds = [
    ...new Set([
      ...audited.map((claim) => claim.claimId),
      ...authenticatedRevisions.map((revision) => revision.adjudicatedClaimId),
    ]),
  ].sort();
  const auditedClaimIdSet = new Set(auditedClaimIds);
  return {
    audited,
    authenticatedRevisions,
    auditedClaimIds,
    retainedDissentClaimIds: [
      ...new Set(
        input.retainedDissentClaimIds.filter(
          (claimId) =>
            input.semanticallyAcceptedClaimIds.has(claimId) &&
            auditedClaimIdSet.has(claimId),
        ),
      ),
    ],
  };
}
