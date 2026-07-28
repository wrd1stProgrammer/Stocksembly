import { readFileSync } from "node:fs";
import { join } from "node:path";

export const BASELINE = ".omo/plans/live-research-office.scope-baseline.json";
export const VERIFIER =
  ".omo/plans/live-research-office.verify-scope-anchor.mjs";
export const BASELINE_SHA256 =
  "b281bca68228e37e45fad01c347fa38e29c6e0e93d4e0c9da0f9c5e612c2b62b";
export const VERIFIER_SHA256 =
  "4b3e202144f2967a875b3f73e107abf9fd7e440374d1f4608f44a82f11a5bf01";

export const DESIGN_MARKER = "stocksembly:live-research-contract:v1";
export const TOPOLOGY_MARKER = "stocksembly:runtime-topology:v1";
export const SPECIALIST_IDS = [
  "market",
  "market_news",
  "company",
  "company_product",
  "company_competition",
  "financial",
  "valuation",
  "financial_quality",
  "risk",
  "risk_policy",
];
export const BEAT_IDS = [
  "briefing",
  "parallel-work",
  "department-talk",
  "visit-wave-a",
  "return-a",
  "visit-wave-b",
  "return-b",
  "representative-gathering",
  "forum",
  "complete",
];
export const GROUP_IDS = [
  "briefing",
  "evidence-collection",
  "department-analysis",
  "cross-team-challenge",
  "evidence-audit",
  "gathering",
  "committee",
  "complete",
];
export const EVENT_GROUP_MAP = {
  run_created: "briefing",
  collection_started: "briefing",
  evidence_cutoff_recorded: "briefing",
  snapshot_sealed: "briefing",
  mandate_sealed: "briefing",
  specialist_memo_committed: "evidence-collection",
  department_consolidation_committed: "department-analysis",
  challenge_committed: "cross-team-challenge",
  followup_committed: "cross-team-challenge",
  owner_response_committed: "cross-team-challenge",
  structural_audit_completed: "evidence-audit",
  semantic_audit_committed: "evidence-audit",
  gathering_started: "gathering",
  department_ballot_committed: "committee",
  chair_synthesis_committed: "committee",
  report_published: "complete",
};
export const LEGACY_EVENT_GROUP_MAP = {
  mandate: "briefing",
  progress: "evidence-collection",
  checkpoint: "department-analysis",
  handoff: "cross-team-challenge",
  summary: ["cross-team-challenge", "evidence-audit"],
  gathering: "gathering",
  presentation: "committee",
  synthesis: "committee",
  complete: "complete",
};

export function jsonError(code, reason, details = {}) {
  return { status: "fail", code, ...(reason ? { reason } : {}), ...details };
}

export function extractQuotedList(source, declaration) {
  const marker = source.indexOf(`const ${declaration}`);
  if (marker < 0) throw new Error(`POLICY_DECLARATION_MISSING:${declaration}`);
  const start = source.indexOf("[", marker);
  const end = source.indexOf("]", start);
  if (start < 0 || end < 0)
    throw new Error(`POLICY_LIST_MISSING:${declaration}`);
  return [...source.slice(start, end).matchAll(/"([^"]+)"/g)].map(
    (match) => match[1],
  );
}

export function parseContract(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`CONTRACT_MARKER_MISSING:${marker}`);
  const fence = source.indexOf("```json", markerIndex);
  const end = source.indexOf("```", fence + 7);
  if (fence < 0 || end < 0) throw new Error(`CONTRACT_JSON_MISSING:${marker}`);
  return JSON.parse(source.slice(fence + 7, end).trim());
}

export function sourceContract(root) {
  const choreography = readFileSync(
    join(root, "src/research/officeChoreographyV7Contract.ts"),
    "utf8",
  );
  const manifest = readFileSync(
    join(root, "src/research/officeSceneManifest.ts"),
    "utf8",
  );
  const events = readFileSync(
    join(root, "src/research/officeChoreographyV7Events.ts"),
    "utf8",
  );
  const beatMatches = [
    ...choreography.matchAll(
      /\{ id: "([^"]+)", startTick: (\d+), endTick: (\d+) \}/g,
    ),
  ];
  const beatSchedule = beatMatches.map((match) => ({
    id: match[1],
    startTick: Number(match[2]),
    endTick: Number(match[3]),
  }));
  const complete = choreography.match(
    /id: "complete",\s*startTick: (\d+),\s*endTick: (\d+)/,
  );
  if (complete)
    beatSchedule.push({
      id: "complete",
      startTick: Number(complete[1]),
      endTick: Number(complete[2]),
    });
  const rosterSource = manifest.slice(
    manifest.indexOf("roster: ["),
    manifest.indexOf("departments: {"),
  );
  const rosterIds = [...rosterSource.matchAll(/\n\s+id: "([^"]+)"/g)].map(
    (match) => match[1],
  );
  const legacyEvents = [
    ...events.matchAll(/id: "([^"]+)",\s*tick: (\d+),\s*kind: "([^"]+)"/g),
  ].map((match) => ({ id: match[1], tick: Number(match[2]), kind: match[3] }));
  return {
    beatSchedule,
    legacyEvents,
    rosterIds,
    width: Number(manifest.match(/width: (\d+)/)?.[1]),
    height: Number(manifest.match(/height: (\d+)/)?.[1]),
    tickMs: Number(choreography.match(/tickMs: (\d+)/)?.[1]),
    tickMsOccurrences: (choreography.match(/tickMs:\s*\d+/g) ?? []).length,
  };
}
