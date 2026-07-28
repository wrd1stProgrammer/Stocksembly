import { OFFICE_CLOCK_CONTRACT } from "./officeChoreographyV7Contract";
import {
  OFFICE_SCENE_MANIFEST,
  type OfficeDepartmentId,
} from "./officeSceneManifest";
import {
  createOfficeSimulation,
  type OfficeActorSnapshot,
  type OfficeSimulationOptions,
  type OfficeSimulationState,
  officeSimulationSnapshot,
  stepOfficeSimulation,
} from "./officeSimulation";

export const EXPECTED_OFFICE_BEAT_SCHEDULE = [
  { id: "briefing", startTick: 0, endTick: 39 },
  { id: "parallel-work", startTick: 40, endTick: 239 },
  { id: "department-talk", startTick: 240, endTick: 359 },
  { id: "visit-wave-a", startTick: 360, endTick: 639 },
  { id: "return-a", startTick: 640, endTick: 719 },
  { id: "visit-wave-b", startTick: 720, endTick: 999 },
  { id: "return-b", startTick: 1000, endTick: 1079 },
  { id: "representative-gathering", startTick: 1080, endTick: 1299 },
  { id: "forum", startTick: 1300, endTick: 1579 },
  {
    id: "complete",
    startTick: OFFICE_CLOCK_CONTRACT.completeTick,
    endTick: OFFICE_CLOCK_CONTRACT.completeTick,
  },
] as const;

export const EXPECTED_OFFICE_EVENT_LEDGER = Object.freeze(
  "mandate work-progress-80 work-progress-140 work-progress-200 checkpoint-market checkpoint-company checkpoint-financial checkpoint-risk handoff-market-company handoff-financial-risk return-market return-financial handoff-company-financial handoff-risk-market ready-market ready-company ready-financial ready-risk representatives-gathering present-market present-company present-financial present-risk chair-synthesis complete".split(
    " ",
  ),
);

export function actor(
  state: OfficeSimulationState,
  id: (typeof OFFICE_SCENE_MANIFEST.roster)[number]["id"],
): OfficeActorSnapshot {
  const found = officeSimulationSnapshot(state).actors.find(
    (candidate) => candidate.id === id,
  );
  if (!found) throw new RangeError(`Missing simulation actor ${id}`);
  return found;
}

export function runTo(
  targetTick: number,
  options: OfficeSimulationOptions = {},
): OfficeSimulationState {
  let state = createOfficeSimulation(options);
  while (state.tick < targetTick) state = stepOfficeSimulation(state);
  return state;
}

export function semanticActors(state: OfficeSimulationState) {
  return officeSimulationSnapshot(state).actors.map(({ id, cell, action }) => [
    id,
    cell,
    action,
  ]);
}

export function manifestActor(id: OfficeActorSnapshot["id"]) {
  const member = OFFICE_SCENE_MANIFEST.roster.find(
    (candidate) => candidate.id === id,
  );
  if (!member) throw new RangeError(`Missing manifest actor ${id}`);
  return member;
}

export function representativeCell(departmentId: OfficeDepartmentId) {
  const department = OFFICE_SCENE_MANIFEST.departments[departmentId];
  const anchor = department.talkAnchors.find(
    (candidate) => candidate.agentId === department.representativeId,
  );
  if (!anchor) throw new RangeError(`Missing representative ${departmentId}`);
  return anchor.cell;
}
