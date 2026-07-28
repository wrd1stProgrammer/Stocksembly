import {
  CAPABILITY_KEYS,
  type CapabilityAvailability,
  type CapabilityDisclosure,
  type CapabilityKey,
  type CapabilityManifest,
} from "./capabilities";
import { registerTrustedCapabilityDisclosure } from "./capabilities.membership";
import { assertNever } from "./ids";
import {
  isSupportedSecurityIdentity,
  type SupportedSecurityIdentity,
} from "./securityIdentity";

export type CapabilitySourceAssessment = {
  readonly key: CapabilityKey;
  readonly state: CapabilityAvailability;
};

const trustedSourceAssessments = new WeakSet<object>();

export function createCapabilitySourceAssessment(
  key: CapabilityKey,
  state: CapabilityAvailability,
): CapabilitySourceAssessment {
  const assessment = { key, state };
  trustedSourceAssessments.add(assessment);
  return assessment;
}

const isTrustedSourceAssessment = (
  value: unknown,
): value is CapabilitySourceAssessment =>
  typeof value === "object" &&
  value !== null &&
  trustedSourceAssessments.has(value);

const makeTrustedCapabilityDisclosure = (
  assessment: CapabilitySourceAssessment,
): CapabilityDisclosure => {
  const disclosure = { key: assessment.key, state: assessment.state };
  registerTrustedCapabilityDisclosure(disclosure);
  return disclosure;
};

export function createCapabilityDisclosureForSourceAssessment(
  identity: unknown,
  assessment: CapabilitySourceAssessment,
): CapabilityDisclosure | undefined {
  if (
    !isSupportedSecurityIdentity(identity) ||
    !isTrustedSourceAssessment(assessment)
  ) {
    return undefined;
  }
  switch (assessment.state.availability) {
    case "available":
    case "stale":
      return assessment.state.source === "licensed_provider"
        ? undefined
        : makeTrustedCapabilityDisclosure(assessment);
    case "unavailable":
    case "withheld_by_rights":
      return makeTrustedCapabilityDisclosure(assessment);
    default:
      return assertNever(assessment.state);
  }
}

export function createWithheldCapabilityDisclosureForIdentity(
  identity: SupportedSecurityIdentity,
  key: CapabilityKey,
  reason: "rights_denied" | "rights_unknown",
): CapabilityDisclosure | undefined {
  return createCapabilityDisclosureForSourceAssessment(
    identity,
    createCapabilitySourceAssessment(key, {
      availability: "withheld_by_rights",
      reason,
    }),
  );
}

export function createDefaultCapabilityManifestForIdentity(
  identity: SupportedSecurityIdentity,
): CapabilityManifest | undefined {
  const states: Readonly<Record<CapabilityKey, CapabilityAvailability>> = {
    identity: { availability: "available", source: "official_sec" },
    sec_filings: { availability: "available", source: "official_sec" },
    sec_company_facts: { availability: "available", source: "official_sec" },
    bls_macro: { availability: "available", source: "official_bls" },
    treasury_yield: { availability: "available", source: "official_treasury" },
    current_market_data: {
      availability: "unavailable",
      reason: "not_configured",
    },
    consensus: { availability: "unavailable", reason: "not_configured" },
    professional_news: {
      availability: "unavailable",
      reason: "not_configured",
    },
    options: { availability: "unavailable", reason: "not_configured" },
    short_interest: { availability: "unavailable", reason: "not_configured" },
  };
  const disclosures = CAPABILITY_KEYS.map((key) =>
    createCapabilityDisclosureForSourceAssessment(
      identity,
      createCapabilitySourceAssessment(key, states[key]),
    ),
  );
  return disclosures.every(
    (disclosure): disclosure is CapabilityDisclosure =>
      disclosure !== undefined,
  )
    ? { version: "workflow-v1", disclosures }
    : undefined;
}
