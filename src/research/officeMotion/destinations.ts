import {
  type Cell,
  OFFICE_SCENE_MANIFEST,
  type OfficeDepartmentId,
} from "../officeSceneManifest";
import type { OfficeActorSnapshot } from "../officeSimulation";
import { FORUM_PLACES, ROSTER, TEAM_TABLES } from "./layout";
import { nearestFloorPoint } from "./navigation";
import type { ActorId, Facing, Point, SeatPlace } from "./types";

export type LiveDestination = SeatPlace & {
  readonly key: string;
  readonly kind: "work" | "team" | "forum" | "visit" | "floor";
  readonly group: string;
  readonly seated: boolean;
  readonly approach: Point;
};

export function sameCell(left: Cell, right: Cell): boolean {
  return left.x === right.x && left.y === right.y;
}

const visitPositions: Readonly<
  Record<
    OfficeDepartmentId,
    {
      readonly host: Point;
      readonly visitor: Point;
      readonly facing: Facing;
    }
  >
> = {
  market: {
    host: { x: 470, y: 400 },
    visitor: { x: 515, y: 400 },
    facing: "right",
  },
  company: {
    host: { x: 1040, y: 410 },
    visitor: { x: 990, y: 410 },
    facing: "left",
  },
  financial: {
    host: { x: 535, y: 880 },
    visitor: { x: 585, y: 880 },
    facing: "right",
  },
  risk: {
    host: { x: 995, y: 910 },
    visitor: { x: 945, y: 910 },
    facing: "left",
  },
};

function seatedPlace(
  id: ActorId,
  kind: "work" | "team" | "forum",
  group: string,
  place: SeatPlace,
): LiveDestination {
  const { position, facing } = place;
  let approach: Point;
  if (kind === "work") approach = { x: position.x, y: position.y - 38 };
  else if (kind === "forum" && id === "market")
    approach = { x: position.x - 14, y: position.y - 38 };
  else if (kind === "forum" && id === "company")
    approach = { x: position.x + 14, y: position.y - 38 };
  else if (kind === "forum" && id === "financial")
    approach = { x: position.x - 38, y: position.y };
  else if (kind === "forum" && id === "risk")
    approach = { x: position.x + 38, y: position.y };
  else if (kind === "forum" && id === "chair")
    approach = { x: position.x + 38, y: position.y - 16 };
  else {
    const offsets = {
      down: { x: 0, y: -38 },
      up: { x: 0, y: 38 },
      left: { x: 38, y: 0 },
      right: { x: -38, y: 0 },
    };
    const offset = offsets[facing];
    approach = { x: position.x + offset.x, y: position.y + offset.y };
  }
  return {
    key: `${kind}:${id}`,
    kind,
    group,
    ...place,
    approach,
    seated: true,
  };
}

export function knownDestination(
  id: ActorId,
  cell: Cell,
): LiveDestination | undefined {
  const member = OFFICE_SCENE_MANIFEST.roster.find((entry) => entry.id === id);
  const definition = ROSTER.find((entry) => entry.id === id);
  if (!member || !definition) return undefined;
  if (sameCell(cell, member.workSeat.cell)) {
    return seatedPlace(id, "work", `work:${id}`, {
      position: definition.seat,
      facing: definition.homeFacing,
    });
  }
  const forum = Object.entries(OFFICE_SCENE_MANIFEST.forum.anchors).find(
    ([actorId, anchor]) => actorId === id && sameCell(cell, anchor.cell),
  );
  const forumPlace = Object.entries(FORUM_PLACES).find(
    ([actorId]) => actorId === id,
  )?.[1];
  if (forum && forumPlace) return seatedPlace(id, "forum", "forum", forumPlace);
  if (sameCell(cell, member.meetingSeat.cell)) {
    const table = TEAM_TABLES.find((entry) =>
      entry.seats.some((seat) => seat.id === id),
    );
    const place = table?.seats.find((seat) => seat.id === id);
    if (table && place)
      return seatedPlace(id, "team", `team:${table.id}`, place);
  }
  for (const [departmentId, department] of Object.entries(
    OFFICE_SCENE_MANIFEST.departments,
  )) {
    const departmentKey = departmentId as OfficeDepartmentId;
    const positions = visitPositions[departmentKey];
    const visitor = sameCell(cell, department.visitorAnchor.cell);
    const anchorIndex = department.talkAnchors.findIndex((anchor) =>
      sameCell(cell, anchor.cell),
    );
    if (!visitor && anchorIndex < 0) continue;
    const base = visitor ? positions.visitor : positions.host;
    const position =
      anchorIndex > 0
        ? nearestFloorPoint({ x: base.x, y: base.y + anchorIndex * 42 })
        : base;
    const facing = visitor
      ? positions.facing === "left"
        ? "right"
        : "left"
      : positions.facing;
    return {
      key: `visit:${departmentId}:${visitor ? "visitor" : anchorIndex}`,
      kind: "visit",
      group: `visit:${departmentId}`,
      position,
      approach: position,
      facing,
      seated: false,
    };
  }
  return undefined;
}

export function destinationFor(actor: OfficeActorSnapshot): LiveDestination {
  const known = knownDestination(actor.id, actor.destination);
  if (known) return known;
  const position = nearestFloorPoint({
    x: (actor.destination.x + 0.5) * OFFICE_SCENE_MANIFEST.world.cellSize,
    y: (actor.destination.y + 1) * OFFICE_SCENE_MANIFEST.world.cellSize,
  });
  return {
    key: `floor:${actor.destination.x}:${actor.destination.y}`,
    kind: "floor",
    group: `floor:${actor.department}`,
    position,
    approach: position,
    facing: actor.facing,
    seated: false,
  };
}
