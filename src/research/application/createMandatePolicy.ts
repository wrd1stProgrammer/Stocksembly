import type { CapabilityManifest } from "../domain/capabilities";
import type {
  MandateLimitation,
  MaterialCrux,
  ResearchScope,
} from "./createMandateContracts";
import { MATERIAL_CRUXES } from "./createMandateContracts";

const CRUX_MATCHERS = [
  ["product_adoption", /product|adoption|customer|제품|채택|고객/i],
  ["competition_positioning", /compet|position|rival|경쟁|포지셔닝/i],
  ["operating_sensitivity", /revenue|margin|eps|earnings|매출|마진|이익/i],
  ["earnings_quality", /cash|accrual|auditor|restatement|현금|발생|감사/i],
  ["downside_risk", /downside|risk factor|위험|리스크/i],
  ["policy_transmission", /policy|regulat|정책|규제/i],
  ["macro_regime", /macro|inflation|unemployment|yield|rate|거시|금리/i],
  ["disclosure_chronology", /event|chronolog|filing|disclosure|공시|사건/i],
  ["business_segments", /business|segment|md&a|사업|부문/i],
  ["financial_trends", /statement|trend|financial|재무|추세/i],
] as const satisfies readonly (readonly [MaterialCrux, RegExp])[];

export function classifyMaterialCruxes(
  scope: ResearchScope,
  question: string | undefined,
): readonly MaterialCrux[] {
  if (scope === "broad") return MATERIAL_CRUXES;
  if (question === undefined) return ["financial_trends"];
  const matched = CRUX_MATCHERS.filter(([, pattern]) =>
    pattern.test(question),
  ).map(([crux]) => crux);
  return matched.length === 0 ? ["financial_trends"] : matched;
}

function capabilityUnavailable(
  capabilities: CapabilityManifest,
  key: "current_market_data" | "consensus",
): boolean {
  const state = capabilities.disclosures.find(
    (item) => item.key === key,
  )?.state;
  return state === undefined || state.availability !== "available";
}

export function mandateLimitations(
  capabilities: CapabilityManifest,
  snapshotLimitations: readonly string[],
): readonly MandateLimitation[] {
  const limitations: MandateLimitation[] = [];
  if (capabilityUnavailable(capabilities, "current_market_data"))
    limitations.push({
      kind: "current_market_data_unavailable",
      detail: "no_sealed_licensed_market_capability",
    });
  if (capabilityUnavailable(capabilities, "consensus"))
    limitations.push({
      kind: "consensus_unavailable",
      detail: "no_sealed_licensed_consensus_capability",
    });
  for (const detail of snapshotLimitations)
    limitations.push({ kind: "snapshot_limitation", detail });
  return limitations;
}
