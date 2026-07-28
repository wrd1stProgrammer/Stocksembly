import type { CapabilityManifest } from "../domain/capabilities";
import {
  createCapabilityDisclosureForSourceAssessment,
  createCapabilitySourceAssessment,
  createDefaultCapabilityManifestForIdentity,
  createWithheldCapabilityDisclosureForIdentity,
} from "../domain/capabilities.internal";
import { admitFixtureSecurityIdentity } from "../domain/securityIdentity.test-support";

const IDENTITY_INPUT = {
  submittedSymbol: "NVDA",
  tickerExchangeRows: [{ symbol: "NVDA", cik: "1045810", exchange: "Nasdaq" }],
  filingForms: [
    { form: "10-K", cik: "1045810" },
    { form: "10-Q", cik: "1045810" },
    { form: "8-K", cik: "1045810" },
  ],
  coverPages: [
    {
      form: "10-K",
      tradingSymbol: "NVDA",
      cik: "1045810",
      securityExchangeName: "Nasdaq",
      security12bTitle: "Common Stock",
    },
  ],
};

type CapabilityFixtureOptions = {
  readonly factsRightsDenied?: boolean;
  readonly macroFailure?: boolean;
  readonly relabelIdentity?: boolean;
};

export function trustedCapabilityManifest(
  options: CapabilityFixtureOptions = {},
): CapabilityManifest {
  const admission = admitFixtureSecurityIdentity(IDENTITY_INPUT);
  if (admission.kind !== "admitted")
    throw new TypeError("trusted identity fixture was not admitted");
  const manifest = createDefaultCapabilityManifestForIdentity(
    admission.identity,
  );
  if (manifest === undefined)
    throw new TypeError("trusted capability fixture was not created");
  const macro = createCapabilityDisclosureForSourceAssessment(
    admission.identity,
    createCapabilitySourceAssessment(
      "bls_macro",
      options.macroFailure === true
        ? { availability: "unavailable", reason: "provider_failure" }
        : { availability: "available", source: "official_bls" },
    ),
  );
  const facts =
    options.factsRightsDenied === true
      ? createWithheldCapabilityDisclosureForIdentity(
          admission.identity,
          "sec_company_facts",
          "rights_denied",
        )
      : manifest.disclosures.find((item) => item.key === "sec_company_facts");
  const identity =
    options.relabelIdentity === true
      ? createCapabilityDisclosureForSourceAssessment(
          admission.identity,
          createCapabilitySourceAssessment("identity", {
            availability: "available",
            source: "official_bls",
          }),
        )
      : manifest.disclosures.find((item) => item.key === "identity");
  if (macro === undefined || facts === undefined || identity === undefined)
    throw new TypeError("trusted capability override was not created");
  return {
    version: "workflow-v1",
    disclosures: manifest.disclosures.map((item) => {
      if (item.key === "bls_macro") return macro;
      if (item.key === "sec_company_facts") return facts;
      return item.key === "identity" ? identity : item;
    }),
  };
}
