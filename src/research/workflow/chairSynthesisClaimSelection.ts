type Claim = { readonly claimId: string };
type Revision = { readonly adjudicatedClaimId: string };

export function selectChairClaims<
  ClaimValue extends Claim,
  RevisionValue extends Revision,
>(input: {
  readonly structuralClaims: readonly ClaimValue[];
  readonly semanticallyAcceptedClaimIds: ReadonlySet<string>;
  readonly positionClaimIds: readonly string[];
  readonly revisions: readonly RevisionValue[];
  readonly retainedDissentClaimIds: readonly string[];
}) {
  const adjudicatedClaimIds = new Set(input.positionClaimIds);
  const retainedDissentClaimIds = new Set(input.retainedDissentClaimIds);
  const audited = [
    ...new Map(
      input.structuralClaims
        .filter(
          (claim) =>
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
    ...audited.map((claim) => claim.claimId),
    ...authenticatedRevisions.map((revision) => revision.adjudicatedClaimId),
  ].sort();
  const auditedClaimIdSet = new Set(auditedClaimIds);
  return {
    audited,
    authenticatedRevisions,
    auditedClaimIds,
    retainedDissentClaimIds: input.retainedDissentClaimIds.filter(
      (claimId) =>
        input.semanticallyAcceptedClaimIds.has(claimId) &&
        auditedClaimIdSet.has(claimId),
    ),
  };
}
