import {
  CAPABILITY_KEYS,
  type CapabilityKey,
  type CapabilitySource,
} from "../domain/capabilities";
import { isTrustedCapabilityDisclosure } from "../domain/capabilities.membership";
import { assertNever } from "../domain/ids";
import type { SnapshotBuildInput } from "./buildSnapshotContracts";

const CAPABILITY_SOURCE = {
  identity: "official_sec",
  sec_filings: "official_sec",
  sec_company_facts: "official_sec",
  bls_macro: "official_bls",
  treasury_yield: "official_treasury",
  current_market_data: "licensed_provider",
  consensus: "licensed_provider",
  professional_news: "licensed_provider",
  options: "licensed_provider",
  short_interest: "licensed_provider",
} as const satisfies Readonly<Record<CapabilityKey, CapabilitySource>>;

type Fail = (code: string, message: string) => never;

export function validateCapabilities(
  input: SnapshotBuildInput,
  fail: Fail,
): void {
  const keys = new Set(input.capabilities.disclosures.map(({ key }) => key));
  if (keys.size !== input.capabilities.disclosures.length)
    fail(
      "capability_manifest_duplicate",
      "capability manifest contains duplicate disclosures",
    );
  if (
    input.capabilities.disclosures.length !== CAPABILITY_KEYS.length ||
    keys.size !== CAPABILITY_KEYS.length ||
    CAPABILITY_KEYS.some((key) => !keys.has(key))
  )
    fail("capability_manifest_incomplete", "capability manifest is incomplete");
  for (const disclosure of input.capabilities.disclosures) {
    if (!isTrustedCapabilityDisclosure(disclosure))
      fail("capability_untrusted", "capability disclosure is not code-owned");
    switch (disclosure.state.availability) {
      case "available":
      case "stale":
        if (disclosure.state.source !== CAPABILITY_SOURCE[disclosure.key])
          fail("capability_source_mismatch", "capability source is relabeled");
        break;
      case "unavailable":
      case "withheld_by_rights":
        break;
      default:
        assertNever(disclosure.state);
    }
  }
}
