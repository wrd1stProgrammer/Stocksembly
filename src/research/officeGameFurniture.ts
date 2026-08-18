import type { OfficeFacing, WorldPoint } from "./officeSceneManifest";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import type { OfficeSimulationSnapshot } from "./officeSimulation";
import type { AgentId } from "./types";

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

export function furnitureStatesForSnapshot(
  snapshot: OfficeSimulationSnapshot,
): readonly OfficeFurnitureRenderState[] {
  const actorById = new Map(snapshot.actors.map((actor) => [actor.id, actor]));
  return Object.freeze(
    OFFICE_SCENE_MANIFEST.furniture.map((furniture) => {
      const geometry = rectGeometry(furniture.footprint);
      const seats = OFFICE_SCENE_MANIFEST.roster.flatMap((member) => {
        if (!belongsToFurniture(member, furniture)) return [];
        const actor = actorById.get(member.id);
        if (!actor) return [];
        const seat = seatForFurniture(member, furniture.purpose);
        return [
          Object.freeze({
            actorId: member.id,
            position: cellFoot(seat.cell),
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
        position: geometry.position,
        size: geometry.size,
        zIndex: Math.round(geometry.bottom * 1000),
        seats: Object.freeze(seats),
      });
    }),
  );
}
