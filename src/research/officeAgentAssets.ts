import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import type { AgentId } from "./types";

export const OFFICE_V9_AGENT_IDS: ReadonlySet<AgentId> = new Set([
  "market",
  "market_news",
  "benchmark",
  "company",
  "company_product",
  "company_competition",
  "financial",
  "valuation",
  "financial_quality",
  "risk",
  "risk_policy",
  "chair",
]);

export function officeAgentAssetPath(actorId: AgentId): string {
  const root = OFFICE_V9_AGENT_IDS.has(actorId)
    ? OFFICE_SCENE_MANIFEST.assets.v9ActorsRoot
    : OFFICE_SCENE_MANIFEST.assets.actorsRoot;
  return `${root}/${actorId}.png`;
}
