import {
  type AtomicClaim,
  AtomicClaimSchema,
  AtomicClaimShape,
  type ChangeCondition,
} from "./claimsSchema";
import { ContractViolation, hashCanonical } from "./contractHelpers";

export {
  type AtomicClaim,
  AtomicClaimSchema,
  type ChangeCondition,
  ChangeConditionSchema,
  type ClaimEvidenceLink,
  ClaimEvidenceLinkSchema,
  type LocalizedClaimText,
  LocalizedClaimTextSchema,
} from "./claimsSchema";

export type AtomicClaimDraft = Omit<
  AtomicClaim,
  | "kind"
  | "claimHash"
  | "auditStatus"
  | "auditReasons"
  | "unsupportedFragments"
  | "changeCondition"
> & {
  readonly changeCondition?: Omit<ChangeCondition, "triggerEvidenceIds"> & {
    readonly triggerEvidenceIds?: readonly string[];
  };
  readonly auditStatus?: AtomicClaim["auditStatus"];
  readonly auditReasons?: readonly string[];
  readonly unsupportedFragments?: readonly string[];
};

function claimHash(value: Omit<AtomicClaim, "claimHash">): string {
  return hashCanonical(value);
}

export function createAtomicClaim(input: AtomicClaimDraft): AtomicClaim {
  const draft = {
    ...input,
    kind: "atomic_claim" as const,
    ...(input.changeCondition === undefined
      ? {}
      : {
          changeCondition: {
            ...input.changeCondition,
            triggerEvidenceIds: [
              ...(input.changeCondition.triggerEvidenceIds ?? []),
            ],
          },
        }),
    auditStatus: input.auditStatus ?? ("pending" as const),
    auditReasons: [...(input.auditReasons ?? [])],
    unsupportedFragments: [...(input.unsupportedFragments ?? [])],
  };
  const parsed = AtomicClaimShape.parse({
    ...draft,
    claimHash: "0".repeat(64),
  });
  const { claimHash: _claimHash, ...withoutHash } = parsed;
  return AtomicClaimSchema.parse({
    ...withoutHash,
    claimHash: claimHash(withoutHash),
  });
}

export type ClaimAuditResult =
  | { readonly kind: "accepted"; readonly claimId: string }
  | {
      readonly kind: "blocked";
      readonly claimId: string;
      readonly reason:
        | "missing_supporting_evidence"
        | "unknown_reason_missing"
        | "integrity_hash_mismatch"
        | "stale_material_claim"
        | "missing_change_condition";
    };

export function auditAtomicClaim(claim: AtomicClaim): ClaimAuditResult {
  const { claimHash: _claimHash, ...withoutHash } = claim;
  if (claimHash(withoutHash) !== claim.claimHash)
    return {
      kind: "blocked",
      claimId: claim.claimId,
      reason: "integrity_hash_mismatch",
    };
  if (claim.epistemicClass === "unknown")
    return claim.unknownReason === undefined
      ? {
          kind: "blocked",
          claimId: claim.claimId,
          reason: "unknown_reason_missing",
        }
      : { kind: "accepted", claimId: claim.claimId };
  if (claim.materiality === "material" && claim.supportingEvidence.length === 0)
    return {
      kind: "blocked",
      claimId: claim.claimId,
      reason: "missing_supporting_evidence",
    };
  if (claim.freshness === "stale" && claim.materiality === "material")
    return {
      kind: "blocked",
      claimId: claim.claimId,
      reason: "stale_material_claim",
    };
  if (
    claim.epistemicClass === "interpretation" &&
    claim.changeCondition === undefined
  )
    return {
      kind: "blocked",
      claimId: claim.claimId,
      reason: "missing_change_condition",
    };
  return { kind: "accepted", claimId: claim.claimId };
}

export function markClaimAudited(
  claim: AtomicClaim,
  result: ClaimAuditResult,
): AtomicClaim {
  if (result.claimId !== claim.claimId)
    throw new ContractViolation(
      "claim_identity",
      "audit result belongs to another claim",
    );
  const auditStatus =
    result.kind === "accepted" ? ("verified" as const) : ("rejected" as const);
  const auditReasons =
    result.kind === "accepted"
      ? claim.auditReasons
      : [...claim.auditReasons, result.reason];
  const { claimHash: _claimHash, ...withoutHash } = {
    ...claim,
    auditStatus,
    auditReasons,
  };
  return AtomicClaimSchema.parse({
    ...withoutHash,
    claimHash: claimHash(withoutHash),
  });
}
