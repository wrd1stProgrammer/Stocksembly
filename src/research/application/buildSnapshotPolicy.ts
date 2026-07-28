import type {
  CapabilityAvailability,
  CapabilityKey,
} from "../domain/capabilities";
import type {
  DatasetFailure,
  SnapshotBuildInput,
  SnapshotEvidence,
} from "./buildSnapshotContracts";
import { isMandatoryEvidence, rightsAllowed } from "./buildSnapshotValidation";

function capabilityState(
  input: SnapshotBuildInput,
  key: CapabilityKey,
): CapabilityAvailability | undefined {
  return input.capabilities.disclosures.find((item) => item.key === key)?.state;
}

function isAvailable(state: CapabilityAvailability | undefined): boolean {
  return state?.availability === "available";
}

export function mandatoryReasons(
  input: SnapshotBuildInput,
  evidence: readonly SnapshotEvidence[],
): readonly string[] {
  const reasons: string[] = [];
  if (input.identity === undefined) reasons.push("identity_missing");
  if (!evidence.some((item) => item.dataset === "identity"))
    reasons.push("identity_evidence_missing");
  if (
    !evidence.some(
      (item) => item.dataset === "sec_filing" && item.form === "10-K",
    )
  )
    reasons.push("10k_missing");
  if (
    !evidence.some(
      (item) => item.dataset === "sec_company_facts" && item.current === true,
    )
  )
    reasons.push("current_company_facts_missing");
  if (input.valueRegistry === undefined) reasons.push("value_registry_missing");
  for (const key of ["identity", "sec_filings", "sec_company_facts"] as const)
    if (!isAvailable(capabilityState(input, key)))
      reasons.push(`${key}_capability_unavailable`);
  for (const item of evidence)
    if (isMandatoryEvidence(item) && !rightsAllowed(item))
      reasons.push(`${item.dataset}_rights_denied`);
  for (const failure of input.failures)
    if (isMandatoryFailure(failure))
      reasons.push(`${failure.dataset}_failure:${failure.code}`);
  return [...new Set(reasons)].sort();
}

function isMandatoryFailure(failure: DatasetFailure): boolean {
  return (
    failure.dataset === "identity" ||
    failure.dataset === "sec_filing" ||
    failure.dataset === "sec_company_facts"
  );
}

export function permittedEvidence(
  evidence: readonly SnapshotEvidence[],
): readonly SnapshotEvidence[] {
  return evidence.filter(rightsAllowed);
}

export function snapshotLimitations(
  input: SnapshotBuildInput,
  evidence: readonly SnapshotEvidence[],
): readonly string[] {
  const limitations: string[] = [];
  for (const item of evidence)
    if (!rightsAllowed(item) && !isMandatoryEvidence(item))
      limitations.push(`rights_excluded:${item.evidenceId}`);
  for (const failure of input.failures)
    if (!isMandatoryFailure(failure))
      limitations.push(`${failure.dataset}_failure:${failure.code}`);
  for (const key of [
    "bls_macro",
    "treasury_yield",
    "current_market_data",
    "consensus",
  ] as const) {
    const state = capabilityState(input, key);
    if (state === undefined || state.availability === "available") continue;
    limitations.push(`${key}:${state.availability}`);
  }
  return [...new Set(limitations)].sort();
}
