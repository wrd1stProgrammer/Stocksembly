import { isTrustedCapabilityDisclosure } from "./capabilities.membership";

export const CAPABILITY_KEYS = [
  "identity",
  "sec_filings",
  "sec_company_facts",
  "bls_macro",
  "treasury_yield",
  "current_market_data",
  "consensus",
  "professional_news",
  "options",
  "short_interest",
] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];
export const CAPABILITY_SOURCES = [
  "official_sec",
  "official_bls",
  "official_treasury",
  "licensed_provider",
] as const;
export type CapabilitySource = (typeof CAPABILITY_SOURCES)[number];

export type CapabilityAvailability =
  | { readonly availability: "available"; readonly source: CapabilitySource }
  | {
      readonly availability: "stale";
      readonly source: CapabilitySource;
      readonly staleSince: string;
    }
  | {
      readonly availability: "unavailable";
      readonly reason: "not_configured" | "provider_failure" | "not_applicable";
    }
  | {
      readonly availability: "withheld_by_rights";
      readonly reason: "rights_denied" | "rights_unknown";
    };

export type CapabilityDisclosure = {
  readonly key: CapabilityKey;
  readonly state: CapabilityAvailability;
};
export type CapabilityManifest = {
  readonly version: "workflow-v1";
  readonly disclosures: readonly CapabilityDisclosure[];
};

export function serializeCapabilityDisclosures(
  manifest: CapabilityManifest,
): string {
  const capabilities = Object.fromEntries(
    manifest.disclosures
      .filter(isTrustedCapabilityDisclosure)
      .map((disclosure) => [disclosure.key, disclosure.state.availability]),
  );
  return JSON.stringify({ version: manifest.version, capabilities });
}
