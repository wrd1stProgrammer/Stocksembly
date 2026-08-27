import type {
  Cell,
  OfficeDepartmentId,
  OfficeFacing,
  OfficeManifestAgentId,
} from "./officeSceneManifest";

export const OFFICE_CLOCK_CONTRACT = Object.freeze({
  tickMs: 50,
  maxCatchUpTicks: 5,
  maxFrameDeltaMs: 250,
  completeTick: 1580,
});

export const OFFICE_DEPARTMENT_TALK_TIMELINE = Object.freeze({
  firstReleaseTick: 240,
  releaseIntervalTicks: 30,
  settledOffsetTicks: 29,
  memberStaggerTicks: 4,
});

export const OFFICE_ENTRY_TIMELINE = Object.freeze({
  firstReleaseTick: 1,
  teamIntervalTicks: 8,
  memberStaggerTicks: 2,
  endTick: 119,
});

export const DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER: readonly OfficeDepartmentId[] =
  Object.freeze(["market", "company", "financial", "risk"]);

const COMPLETE_BEAT = {
  id: "complete",
  startTick: 1580,
  endTick: 1580,
} as const;

export const OFFICE_BEAT_SCHEDULE = Object.freeze([
  { id: "briefing", startTick: 0, endTick: 39 },
  { id: "parallel-work", startTick: 40, endTick: 239 },
  { id: "department-talk", startTick: 240, endTick: 359 },
  { id: "visit-wave-a", startTick: 360, endTick: 639 },
  { id: "return-a", startTick: 640, endTick: 719 },
  { id: "visit-wave-b", startTick: 720, endTick: 999 },
  { id: "return-b", startTick: 1000, endTick: 1079 },
  { id: "representative-gathering", startTick: 1080, endTick: 1299 },
  { id: "forum", startTick: 1300, endTick: 1579 },
  COMPLETE_BEAT,
] as const);

export type OfficeBeat = (typeof OFFICE_BEAT_SCHEDULE)[number];
export type OfficeBeatId = OfficeBeat["id"];
export type OfficeActorAction =
  | "chair-synthesis"
  | "idle"
  | "listen"
  | "orient"
  | "present"
  | "return"
  | "seated-work"
  | "stand"
  | "summarize"
  | "talk"
  | "walk";

export type OfficeActorDirective = {
  readonly actorId: OfficeManifestAgentId;
  readonly destination: Cell;
  readonly facing: OfficeFacing;
  readonly terminalAction: OfficeActorAction;
  readonly travelAction: "return" | "walk";
  readonly revisionKey: string;
};

export type OfficeCameraTarget =
  | {
      readonly kind: "actors";
      readonly actorIds: readonly OfficeManifestAgentId[];
    }
  | { readonly kind: "overview" };

export function assertNeverOffice(value: never): never {
  throw new RangeError(`Unknown office variant: ${JSON.stringify(value)}`);
}

export function officeBeatAt(tick: number): OfficeBeat {
  return (
    OFFICE_BEAT_SCHEDULE.find(
      (beat) => tick >= beat.startTick && tick <= beat.endTick,
    ) ?? COMPLETE_BEAT
  );
}
