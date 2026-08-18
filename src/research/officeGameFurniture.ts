import type { OfficeFacing, WorldPoint } from "./officeSceneManifest";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import type { OfficeSimulationSnapshot } from "./officeSimulation";
import type { AgentId } from "./types";

export const WORKSTATION_TABLE_VISUAL_OFFSET_Y = 8;
export const WORKSTATION_SEAT_VISUAL_OFFSET_Y = 16;

export type OfficeSeatRenderState = {
  readonly actorId: AgentId;
  readonly position: WorldPoint;
  readonly laptopPosition: WorldPoint;
  readonly facing: OfficeFacing;
  readonly occupied: boolean;
};

export type OfficeFurnitureRenderState = {
  readonly id: string;
  readonly kind: (typeof OFFICE_SCENE_MANIFEST.furniture)[number]["kind"];
  readonly purpose: (typeof OFFICE_SCENE_MANIFEST.furniture)[number]["purpose"];
  readonly assetPath: string | null;
  readonly accent: number;
  readonly position: WorldPoint;
  readonly size: { readonly width: number; readonly height: number };
  readonly zIndex: number;
  readonly seats: readonly OfficeSeatRenderState[];
};

function seatForFurniture(
  member: (typeof OFFICE_SCENE_MANIFEST.roster)[number],
  purpose: OfficeFurnitureRenderState["purpose"],
) {
  return purpose === "meeting" ? member.meetingSeat : member.workSeat;
}

function belongsToFurniture(
  member: (typeof OFFICE_SCENE_MANIFEST.roster)[number],
  furniture: (typeof OFFICE_SCENE_MANIFEST.furniture)[number],
): boolean {
  if ("memberId" in furniture) return member.id === furniture.memberId;
  if (member.departmentId !== furniture.roomId) return false;
  return furniture.purpose === "chair"
    ? member.departmentId === "chair"
    : member.departmentId !== "chair";
}

function cellFoot(cell: {
  readonly x: number;
  readonly y: number;
}): WorldPoint {
  const { cellSize } = OFFICE_SCENE_MANIFEST.world;
  return Object.freeze({
    x: cell.x * cellSize + cellSize / 2,
    y: (cell.y + 1) * cellSize,
  });
}

function rectGeometry(rect: {
  readonly min: { readonly x: number; readonly y: number };
  readonly max: { readonly x: number; readonly y: number };
}) {
  const { cellSize } = OFFICE_SCENE_MANIFEST.world;
  const left = rect.min.x * cellSize;
  const top = rect.min.y * cellSize;
  const footprintWidth = (rect.max.x - rect.min.x + 1) * cellSize;
  const footprintHeight = (rect.max.y - rect.min.y + 1) * cellSize;
  const visualInset = 10;
  const width = footprintWidth - visualInset * 2;
  const height = footprintHeight - visualInset * 2;
  return Object.freeze({
    position: Object.freeze({
      x: left + footprintWidth / 2,
      y: top + footprintHeight / 2,
    }),
    size: Object.freeze({ width, height }),
    bottom: top + footprintHeight,
  });
}

export function workstationSeatVisualPosition(
  actorId: AgentId,
): WorldPoint | undefined {
  const member = OFFICE_SCENE_MANIFEST.roster.find(
    (candidate) => candidate.id === actorId,
  );
  if (!member || member.departmentId === "chair") return undefined;
  const furniture = OFFICE_SCENE_MANIFEST.furniture.find(
    (candidate) =>
      candidate.purpose === "workstation" &&
      "memberId" in candidate &&
      candidate.memberId === actorId,
  );
  if (!furniture) return undefined;
  const geometry = rectGeometry(furniture.footprint);
  return Object.freeze({
    x: geometry.position.x,
    y: cellFoot(member.workSeat.cell).y + WORKSTATION_SEAT_VISUAL_OFFSET_Y,
  });
}

export function furnitureStatesForSnapshot(
  snapshot: OfficeSimulationSnapshot,
): readonly OfficeFurnitureRenderState[] {
  const actorById = new Map(snapshot.actors.map((actor) => [actor.id, actor]));
  return Object.freeze(
    OFFICE_SCENE_MANIFEST.furniture.map((furniture) => {
      const geometry = rectGeometry(furniture.footprint);
      const workstationOffsetY =
        furniture.purpose === "workstation"
          ? WORKSTATION_TABLE_VISUAL_OFFSET_Y
          : 0;
      const seatOffsetY =
        furniture.purpose === "workstation"
          ? WORKSTATION_SEAT_VISUAL_OFFSET_Y
          : 0;
      const seats = OFFICE_SCENE_MANIFEST.roster.flatMap((member) => {
        if (!belongsToFurniture(member, furniture)) return [];
        const actor = actorById.get(member.id);
        if (!actor) return [];
        const seat = seatForFurniture(member, furniture.purpose);
        const basePosition = cellFoot(seat.cell);
        const workstationPosition = workstationSeatVisualPosition(member.id);
        return [
          Object.freeze({
            actorId: member.id,
            position:
              furniture.purpose === "workstation" && workstationPosition
                ? workstationPosition
                : Object.freeze({
                    ...basePosition,
                    y: basePosition.y + seatOffsetY,
                  }),
            laptopPosition: cellFoot(seat.inputCell),
            facing: seat.facing,
            occupied:
              actor.cell.x === seat.cell.x &&
              actor.cell.y === seat.cell.y &&
              ["idle", "listen", "seated-work", "talk"].includes(actor.action),
          }),
        ];
      });
      return Object.freeze({
        id: furniture.id,
        kind: furniture.kind,
        purpose: furniture.purpose,
        assetPath: furniture.assetPath,
        accent: furniture.accent,
        position: Object.freeze({
          ...geometry.position,
          y: geometry.position.y + workstationOffsetY,
        }),
        size: geometry.size,
        zIndex: Math.round(geometry.bottom * 1000),
        seats: Object.freeze(seats),
      });
    }),
  );
}
