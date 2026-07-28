import {
  type LegacyOfficeSlot,
  meetingSpotFor,
  OFFICE_SCENE_MANIFEST,
  seatFor,
} from "./officeSceneManifest";
import type { AgentId } from "./types";

export type Direction = "down" | "left" | "right" | "up";

export type Point = {
  readonly x: number;
  readonly y: number;
};

export type AgentPlacement = {
  readonly home: Point;
  readonly workDirection: Direction;
  readonly meeting: Point;
  readonly meetingDirection: Direction;
  readonly route: readonly Point[];
};

export const OFFICE_SIZE = { width: 1448, height: 1086 } as const;
export const FRAME_SIZE = { width: 160, height: 192 } as const;
export const WALK_SPEED = 48;
export const AGENT_SCALE = 1;

const placement = (
  agentId: AgentId,
  corridor: readonly Point[],
): AgentPlacement => {
  const seat = seatFor(agentId);
  const meeting = meetingSpotFor(agentId);
  return {
    home: seat.hip,
    workDirection: seat.direction,
    route: [seat.approach, ...corridor, meeting.approach, meeting.point],
    meeting: meeting.point,
    meetingDirection: meeting.direction,
  };
};

const legacyCorridors: Readonly<Record<LegacyOfficeSlot, readonly Point[]>> = {
  "north-west": [
    { x: 390, y: 420 },
    { x: 620, y: 420 },
  ],
  "north-east": [
    { x: 1055, y: 420 },
    { x: 828, y: 420 },
  ],
  west: [
    { x: 480, y: 520 },
    { x: 480, y: 565 },
  ],
  east: [
    { x: 968, y: 520 },
    { x: 968, y: 565 },
  ],
  "south-west": [
    { x: 390, y: 710 },
    { x: 620, y: 710 },
  ],
  "south-east": [
    { x: 1055, y: 710 },
    { x: 828, y: 710 },
  ],
};

function placementForRosterMember(
  member: (typeof OFFICE_SCENE_MANIFEST.roster)[number],
): AgentPlacement {
  return placement(member.id, legacyCorridors[member.v6Slot]);
}

const roster = OFFICE_SCENE_MANIFEST.roster;
export const agentPlacements = {
  [roster[0].id]: placementForRosterMember(roster[0]),
  [roster[1].id]: placementForRosterMember(roster[1]),
  [roster[2].id]: placementForRosterMember(roster[2]),
  [roster[3].id]: placementForRosterMember(roster[3]),
  [roster[4].id]: placementForRosterMember(roster[4]),
  [roster[5].id]: placementForRosterMember(roster[5]),
  [roster[6].id]: placementForRosterMember(roster[6]),
  [roster[7].id]: placementForRosterMember(roster[7]),
  [roster[8].id]: placementForRosterMember(roster[8]),
  [roster[9].id]: placementForRosterMember(roster[9]),
  [roster[10].id]: placementForRosterMember(roster[10]),
  [roster[11].id]: placementForRosterMember(roster[11]),
} satisfies Readonly<Record<AgentId, AgentPlacement>>;

export function directionBetween(from: Point, to: Point): Direction {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX < 0 ? "left" : "right";
  return deltaY < 0 ? "up" : "down";
}

export function distanceBetween(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
