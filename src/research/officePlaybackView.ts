import type { ResearchEventWithMode } from "./compositionMode";
import { OFFICE_CLOCK_CONTRACT } from "./officeChoreography";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import type { OfficeSimulationSnapshot } from "./officeSimulation";
import type {
  AgentId,
  ResearchDepartmentStatus,
  ResearchVisitAnnotation,
} from "./types";

const ALL_REPRESENTATIVES: readonly AgentId[] = OFFICE_SCENE_MANIFEST.roster
  .filter((member) => member.representative)
  .map((member) => member.id);
const chairMember = OFFICE_SCENE_MANIFEST.roster.find(
  (member) => member.departmentId === "chair",
);
if (!chairMember) throw new RangeError("Office manifest has no chair");
const CHAIR_ID: AgentId = chairMember.id;
const VISIT_PAIRS = [
  {
    id: "visit-a-market-company",
    phase: "visit-wave-a",
    visitorId: "market",
    hostId: "company",
  },
  {
    id: "visit-a-financial-risk",
    phase: "visit-wave-a",
    visitorId: "financial",
    hostId: "risk",
  },
  {
    id: "visit-b-company-financial",
    phase: "visit-wave-b",
    visitorId: "company",
    hostId: "financial",
  },
  {
    id: "visit-b-risk-market",
    phase: "visit-wave-b",
    visitorId: "risk",
    hostId: "market",
  },
] as const satisfies readonly {
  readonly id: string;
  readonly phase: "visit-wave-a" | "visit-wave-b";
  readonly visitorId: AgentId;
  readonly hostId: AgentId;
}[];
export function progressAtTick(tick: number): number {
  if (tick === 0) return 5;
  return Math.min(
    100,
    Math.max(5, Math.round((tick / OFFICE_CLOCK_CONTRACT.completeTick) * 100)),
  );
}
export function currentResearchEvent(
  snapshot: OfficeSimulationSnapshot,
  events: readonly ResearchEventWithMode[],
): ResearchEventWithMode {
  const latest = [...events]
    .reverse()
    .find((event) => event.tick !== undefined && event.tick <= snapshot.tick);
  if (latest) return latest;
  const first = events[0];
  if (!first) throw new RangeError("Composition has no playback events");
  return first;
}
export function departmentStatuses(
  snapshot: OfficeSimulationSnapshot,
): readonly ResearchDepartmentStatus[] {
  const actorById = new Map(snapshot.actors.map((actor) => [actor.id, actor]));
  const finalAssembly =
    snapshot.beatId === "representative-gathering" ||
    snapshot.beatId === "forum" ||
    snapshot.beatId === "complete";
  return Object.entries(OFFICE_SCENE_MANIFEST.departments).map(
    ([id, department]) => {
      const members = department.memberIds.map((memberId) =>
        actorById.get(memberId),
      );
      const activeCount = members.filter(
        (actor) =>
          actor &&
          actor.action !== "idle" &&
          (!finalAssembly || actor.action !== "seated-work"),
      ).length;
      const walkingCount = members.filter(
        (actor) => actor && ["stand", "walk", "return"].includes(actor.action),
      ).length;
      const completeCount = members.filter(
        (actor) =>
          actor &&
          actor.id !== department.representativeId &&
          (actor.action === "idle" ||
            (finalAssembly && actor.action === "seated-work")),
      ).length;
      const status =
        snapshot.beatId === "representative-gathering" ||
        snapshot.beatId === "forum"
          ? "forum"
          : snapshot.beatId === "visit-wave-a" ||
              snapshot.beatId === "visit-wave-b"
            ? "visiting"
            : snapshot.beatId === "return-b" || snapshot.beatId === "complete"
              ? "ready"
              : snapshot.beatId === "briefing"
                ? "briefing"
                : "working";
      return Object.freeze({
        id: id as ResearchDepartmentStatus["id"],
        memberIds: Object.freeze([
          ...department.memberIds,
        ]) as readonly AgentId[],
        representativeId: department.representativeId,
        memberCount: department.memberIds.length,
        activeCount,
        walkingCount,
        completeCount,
        status,
      });
    },
  );
}
export function visitAnnotations(
  snapshot: OfficeSimulationSnapshot,
): readonly ResearchVisitAnnotation[] {
  return Object.freeze(
    VISIT_PAIRS.filter((pair) => {
      if (pair.phase === "visit-wave-a") return snapshot.tick >= 360;
      return snapshot.tick >= 720;
    }).map((pair) =>
      Object.freeze({
        ...pair,
        active: snapshot.beatId === pair.phase,
      }),
    ),
  );
}
export function activeIdsForSnapshot(snapshot: OfficeSimulationSnapshot): {
  readonly active: readonly AgentId[];
  readonly walking: readonly AgentId[];
  readonly completed: readonly AgentId[];
} {
  const active = snapshot.actors
    .filter((actor) => actor.action !== "idle")
    .map((actor) => actor.id);
  const walking = snapshot.actors
    .filter((actor) => ["stand", "walk", "return"].includes(actor.action))
    .map((actor) => actor.id);
  const completed = snapshot.actors
    .filter(
      (actor) =>
        actor.action === "idle" &&
        (snapshot.beatId === "complete" || actor.id !== CHAIR_ID),
    )
    .map((actor) => actor.id);
  return Object.freeze({
    active: Object.freeze(active),
    walking: Object.freeze(walking),
    completed: Object.freeze(completed),
  });
}
export function gatheringIds(snapshot: OfficeSimulationSnapshot): {
  readonly representatives: readonly AgentId[];
  readonly nonRepresentatives: readonly AgentId[];
} {
  const inGathering =
    snapshot.beatId === "representative-gathering" ||
    snapshot.beatId === "forum" ||
    snapshot.beatId === "complete";
  return Object.freeze({
    representatives: Object.freeze(
      inGathering ? [...ALL_REPRESENTATIVES, CHAIR_ID] : [],
    ),
    nonRepresentatives: Object.freeze(
      inGathering
        ? OFFICE_SCENE_MANIFEST.roster
            .filter(
              (member) =>
                !member.representative && member.departmentId !== "chair",
            )
            .map((member) => member.id)
        : [],
    ),
  });
}
export function eventLedger(
  snapshot: OfficeSimulationSnapshot,
  events: readonly ResearchEventWithMode[],
): readonly ResearchEventWithMode[] {
  return Object.freeze(
    events.filter(
      (event) => event.tick !== undefined && event.tick <= snapshot.tick,
    ),
  );
}
