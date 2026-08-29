import type { SourcePurpose } from "../domain/evidenceCoreSchemas";
import {
  evaluatePublicClaimEligibility,
  type PublicClaimInput,
} from "../domain/publicClaimEligibility";
import { validateSourcePurposeBinding } from "../domain/sourcePurpose";

export type RecoverablePublicClaim = {
  readonly claim: PublicClaimInput;
  readonly text?: Readonly<{ en: string; ko: string }>;
  readonly sourceIds: readonly string[];
  readonly sourcePurpose?: Readonly<{
    required: SourcePurpose;
    bindings: readonly unknown[];
  }>;
};

export type RecoverablePublicScenario = {
  readonly id: string;
  readonly claimIds: readonly string[];
  readonly sourceIds: readonly string[];
};

type ClaimOmissionReason =
  | "claim_ineligible"
  | "limitations_duplicate"
  | "limitations_cap_exceeded"
  | "unknown_source"
  | "source_purpose_not_allowed";

export type PublicationRecoveryOmission =
  | { readonly claimId: string; readonly reason: ClaimOmissionReason }
  | {
      readonly itemId: string;
      readonly reason: "scenario_claim_invalid" | "scenario_source_invalid";
    };

export type PublicPublicationRecoveryInput = {
  readonly registeredSourceIds: readonly string[];
  readonly claims: readonly RecoverablePublicClaim[];
  readonly scenarios: readonly RecoverablePublicScenario[];
  readonly limitationMateriality?: Readonly<Record<string, number>>;
  readonly limitationDeduplicationKeys?: Readonly<Record<string, string>>;
  readonly repairClaim?: (
    claim: RecoverablePublicClaim,
  ) => RecoverablePublicClaim | undefined;
  readonly repairScenario?: (
    scenario: RecoverablePublicScenario,
  ) => RecoverablePublicScenario | undefined;
};

export type PublicPublicationRecovery = {
  readonly publishedClaims: readonly RecoverablePublicClaim[];
  readonly limitations: readonly RecoverablePublicClaim[];
  readonly publishedScenarios: readonly RecoverablePublicScenario[];
  readonly omissions: readonly PublicationRecoveryOmission[];
  readonly repairAttempts: readonly {
    readonly claimId: string;
    readonly attempts: 1;
  }[];
  readonly scenarioRepairAttempts: readonly {
    readonly itemId: string;
    readonly attempts: 1;
  }[];
  readonly blockers: readonly ["no_grounded_core_answer"] | readonly [];
};

function publicationDefect(
  claim: RecoverablePublicClaim,
  registeredSourceIds: ReadonlySet<string>,
): ClaimOmissionReason | undefined {
  if (
    claim.sourceIds.length === 0 ||
    claim.sourceIds.some((sourceId) => !registeredSourceIds.has(sourceId))
  )
    return "unknown_source";
  if (claim.sourcePurpose === undefined) return undefined;
  const purposeEligible = claim.sourcePurpose.bindings.some((binding) => {
    const result = validateSourcePurposeBinding(binding);
    return (
      result.kind === "eligible" &&
      result.claimId === claim.claim.claimId &&
      result.purpose === claim.sourcePurpose?.required
    );
  });
  return purposeEligible ? undefined : "source_purpose_not_allowed";
}

function normalizedDeduplicationKey(
  claim: RecoverablePublicClaim,
  keys: Readonly<Record<string, string>>,
): string {
  const explicit = keys[claim.claim.claimId];
  const fallback = claim.text?.en ?? claim.claim.claimId;
  return (explicit ?? fallback).trim().toLocaleLowerCase("en-US");
}

function scenarioDefect(
  scenario: RecoverablePublicScenario,
  publishedClaimIds: ReadonlySet<string>,
  registeredSourceIds: ReadonlySet<string>,
): "scenario_claim_invalid" | "scenario_source_invalid" | undefined {
  if (scenario.claimIds.some((claimId) => !publishedClaimIds.has(claimId)))
    return "scenario_claim_invalid";
  if (
    scenario.sourceIds.length === 0 ||
    scenario.sourceIds.some((sourceId) => !registeredSourceIds.has(sourceId))
  )
    return "scenario_source_invalid";
  return undefined;
}

/**
 * The single application boundary that turns audited candidates into a safe
 * public subset. It never upgrades a semantic verdict and never retries an
 * item more than once.
 */
export function recoverPublicPublication(
  input: PublicPublicationRecoveryInput,
): PublicPublicationRecovery {
  const registeredSourceIds = new Set(input.registeredSourceIds);
  const groundedFactIds = new Set<string>();
  const publishedClaims: RecoverablePublicClaim[] = [];
  const limitationCandidates: RecoverablePublicClaim[] = [];
  const omissions: PublicationRecoveryOmission[] = [];
  const repairAttempts: { readonly claimId: string; readonly attempts: 1 }[] =
    [];
  const repairedClaims = new Map<string, RecoverablePublicClaim>();

  // Resolve grounded factual inputs first so analytical conclusions are
  // order-independent. A successful evidence repair can establish grounding,
  // but it cannot change the factual claim's semantic verdict.
  for (const initial of input.claims) {
    if (
      initial.claim.kind !== "factual_claim" ||
      initial.claim.semanticVerdict !== "entailed"
    )
      continue;
    let candidate = initial;
    if (
      publicationDefect(candidate, registeredSourceIds) !== undefined &&
      input.repairClaim !== undefined
    ) {
      repairAttempts.push({ claimId: initial.claim.claimId, attempts: 1 });
      candidate = input.repairClaim(initial) ?? initial;
      repairedClaims.set(initial.claim.claimId, candidate);
    }
    if (publicationDefect(candidate, registeredSourceIds) === undefined)
      groundedFactIds.add(initial.claim.claimId);
  }

  for (const initial of input.claims) {
    const eligibility = evaluatePublicClaimEligibility(
      initial.claim,
      groundedFactIds,
    );
    if (eligibility.action === "limitations_only") {
      let candidate = initial;
      let defect = publicationDefect(candidate, registeredSourceIds);
      if (defect !== undefined && input.repairClaim !== undefined) {
        repairAttempts.push({ claimId: initial.claim.claimId, attempts: 1 });
        const repaired = input.repairClaim(initial);
        candidate =
          repaired?.claim.claimId === initial.claim.claimId
            ? repaired
            : initial;
        defect = publicationDefect(candidate, registeredSourceIds);
      }
      if (defect === undefined) limitationCandidates.push(candidate);
      else omissions.push({ claimId: initial.claim.claimId, reason: defect });
      continue;
    }
    if (eligibility.action !== "publish") {
      omissions.push({
        claimId: initial.claim.claimId,
        reason: "claim_ineligible",
      });
      continue;
    }

    let candidate = repairedClaims.get(initial.claim.claimId) ?? initial;
    let defect = publicationDefect(candidate, registeredSourceIds);
    if (
      defect !== undefined &&
      input.repairClaim !== undefined &&
      !repairedClaims.has(initial.claim.claimId)
    ) {
      repairAttempts.push({ claimId: initial.claim.claimId, attempts: 1 });
      candidate = input.repairClaim(initial) ?? initial;
      defect = publicationDefect(candidate, registeredSourceIds);
    }
    if (defect === undefined) publishedClaims.push(candidate);
    else omissions.push({ claimId: initial.claim.claimId, reason: defect });
  }

  const limitationScores = input.limitationMateriality ?? {};
  const limitationKeys = input.limitationDeduplicationKeys ?? {};
  const seenLimitationKeys = new Set<string>();
  const limitations: RecoverablePublicClaim[] = [];
  for (const candidate of [...limitationCandidates].sort(
    (left, right) =>
      (limitationScores[right.claim.claimId] ?? 0) -
      (limitationScores[left.claim.claimId] ?? 0),
  )) {
    const key = normalizedDeduplicationKey(candidate, limitationKeys);
    if (seenLimitationKeys.has(key)) {
      omissions.push({
        claimId: candidate.claim.claimId,
        reason: "limitations_duplicate",
      });
      continue;
    }
    seenLimitationKeys.add(key);
    if (limitations.length >= 3) {
      omissions.push({
        claimId: candidate.claim.claimId,
        reason: "limitations_cap_exceeded",
      });
      continue;
    }
    limitations.push(candidate);
  }

  const publishedClaimIds = new Set(
    publishedClaims.map((candidate) => candidate.claim.claimId),
  );
  const scenarioRepairAttempts: {
    readonly itemId: string;
    readonly attempts: 1;
  }[] = [];
  const publishedScenarios = input.scenarios.flatMap((initial) => {
    let candidate = initial;
    let defect = scenarioDefect(
      candidate,
      publishedClaimIds,
      registeredSourceIds,
    );
    if (defect !== undefined && input.repairScenario !== undefined) {
      scenarioRepairAttempts.push({ itemId: initial.id, attempts: 1 });
      const repaired = input.repairScenario(initial);
      candidate = repaired?.id === initial.id ? repaired : initial;
      defect = scenarioDefect(
        candidate,
        publishedClaimIds,
        registeredSourceIds,
      );
    }
    if (defect === undefined) return [candidate];
    omissions.push({ itemId: initial.id, reason: defect });
    return [];
  });
  const hasGroundedCoreAnswer = publishedClaims.some(
    (candidate) => candidate.claim.materiality === "material",
  );
  return {
    publishedClaims,
    limitations,
    publishedScenarios,
    omissions,
    repairAttempts,
    scenarioRepairAttempts,
    blockers: hasGroundedCoreAnswer ? [] : ["no_grounded_core_answer"],
  };
}
