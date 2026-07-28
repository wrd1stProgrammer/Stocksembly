import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BEAT_IDS,
  DESIGN_MARKER,
  EVENT_GROUP_MAP,
  GROUP_IDS,
  LEGACY_EVENT_GROUP_MAP,
  parseContract,
  SPECIALIST_IDS,
  sourceContract,
  TOPOLOGY_MARKER,
} from "./verify-scope-fidelity-core.mjs";

function matches(value, expected, error) {
  if (JSON.stringify(value) !== JSON.stringify(expected))
    throw new Error(error);
}

function groupForTick(groups, beats, tick) {
  const beat = beats.find(
    (candidate) => tick >= candidate.startTick && tick <= candidate.endTick,
  );
  return groups.find((group) => group.beatIds.includes(beat?.id))?.id;
}

export function validateContract(root) {
  const design = parseContract(
    readFileSync(join(root, "DESIGN.md"), "utf8"),
    DESIGN_MARKER,
  );
  const architecture = parseContract(
    readFileSync(join(root, "docs/architecture/research-runtime.md"), "utf8"),
    TOPOLOGY_MARKER,
  );
  const source = sourceContract(root);
  const groups = design.transcriptGroups ?? [];
  matches(
    source.beatSchedule.map((beat) => beat.id),
    BEAT_IDS,
    "BEAT_SOURCE_DRIFT",
  );
  if (
    source.width !== 1374 ||
    source.height !== 1145 ||
    source.tickMs !== 50 ||
    source.tickMsOccurrences !== 1
  )
    throw new Error("OFFICE_SOURCE_DRIFT");
  matches(
    source.rosterIds,
    [...SPECIALIST_IDS, "chair"],
    "ROSTER_SOURCE_DRIFT",
  );
  matches(
    groups.map((group) => group.id),
    GROUP_IDS,
    "TRANSCRIPT_GROUP_INVALID",
  );
  matches(
    groups.flatMap((group) => group.beatIds),
    BEAT_IDS,
    "TRANSCRIPT_GROUP_INVALID",
  );
  matches(
    BEAT_IDS.map((id) => ({ id, ...design.beatRanges?.[id] })),
    source.beatSchedule,
    "BEAT_RANGE_INVALID",
  );
  matches(design.eventGroupMap, EVENT_GROUP_MAP, "EVENT_GROUP_MAP_INVALID");
  matches(
    design.legacyEventGroupMap,
    LEGACY_EVENT_GROUP_MAP,
    "LEGACY_EVENT_GROUP_MAP_INVALID",
  );
  for (const event of source.legacyEvents) {
    const declared = design.legacyEventGroupMap?.[event.kind];
    const allowed = Array.isArray(declared) ? declared : [declared];
    if (
      !allowed.includes(groupForTick(groups, source.beatSchedule, event.tick))
    )
      throw new Error(`LEGACY_EVENT_GROUP_INVALID:${event.id}`);
  }
  if (
    design.world?.width !== 1374 ||
    design.world?.height !== 1145 ||
    design.world?.camera !== "overview" ||
    design.world?.activeFollow !== false ||
    design.world?.aspectRatio !== "1374:1145"
  )
    throw new Error("WORLD_CAMERA_INVALID");
  if (
    design.clock?.tickMs !== 50 ||
    design.clock?.secondClock !== false ||
    design.production?.mockOnly !== false ||
    design.production?.activeFollow !== false ||
    design.production?.worldAspectRatio !== "1374:1145"
  )
    throw new Error("PRODUCTION_CONTRACT_INVALID");
  if (
    JSON.stringify(design.roster?.specialistIds) !==
      JSON.stringify(SPECIALIST_IDS) ||
    design.roster?.chairId !== "chair" ||
    design.roster?.count !== 11
  )
    throw new Error("ROSTER_CONTRACT_INVALID");
  if (
    JSON.stringify(design.allAgentTruth?.specialistIds) !==
      JSON.stringify(SPECIALIST_IDS) ||
    design.allAgentTruth?.chairId !== "chair" ||
    design.allAgentTruth?.acceptedArtifacts !== 11 ||
    design.allAgentTruth?.privateReasoning !== false
  )
    throw new Error("AGENT_TRUTH_INVALID");
  if (
    Object.values(design.capabilities ?? {}).some(
      (status) => status !== "unavailable",
    )
  )
    throw new Error("CAPABILITY_POSTURE_INVALID");
  if (
    design.identityParity?.stableIds !== true ||
    design.identityParity?.rosterCount !== 11 ||
    JSON.stringify(design.identityParity?.locales) !==
      JSON.stringify(["en", "ko"]) ||
    design.identityParity?.equalGroupCount !== true
  )
    throw new Error("LOCALE_PARITY_INVALID");
  if (
    design.accessibility?.domProjection !== true ||
    design.accessibility?.canvasDecorative !== true ||
    design.accessibility?.reducedMotion !== true ||
    design.accessibility?.zoom200 !== true ||
    design.accessibility?.localeParity !== true
  )
    throw new Error("ACCESSIBILITY_INVALID");
  if (
    design.reportIA?.length !== 12 ||
    design.architectureDoc !== "docs/architecture/research-runtime.md"
  )
    throw new Error("REPORT_IA_INVALID");
  if (
    architecture.web !== "loopback-next-projection" ||
    architecture.worker !== "separate-long-lived-node" ||
    architecture.state !== "sqlite-wal" ||
    architecture.artifacts !== "immutable-sha256-cas" ||
    architecture.stream !== "snapshot-sse" ||
    architecture.routeHandlersExecuteResearch !== false ||
    architecture.persistence?.artifactHash !== "SHA-256" ||
    architecture.persistence?.acceptedArtifacts !== 11 ||
    architecture.transcript?.groups !== 8 ||
    architecture.transcript?.clockMs !== 50 ||
    architecture.transcript?.secondClock !== false ||
    architecture.clients?.snapshot !== true ||
    architecture.clients?.sseReplay !== true ||
    architecture.clients?.disconnectCancelsResearch !== false
  )
    throw new Error("TOPOLOGY_CONTRACT_INVALID");
  return { contract: design, architecture, source };
}
