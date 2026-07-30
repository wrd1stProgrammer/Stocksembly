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
  readonly accent: number;
  readonly position: WorldPoint;
  readonly size: { readonly width: number; readonly height: number };
  readonly zIndex: number;
  readonly seats: readonly OfficeSeatRenderState[];
};

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
        if (member.departmentId !== furniture.roomId) return [];
        const actor = actorById.get(member.id);
        if (!actor) return [];
        return [
          Object.freeze({
            actorId: member.id,
            position: cellFoot(member.seat.cell),
            laptopPosition: cellFoot(member.seat.inputCell),
            facing: member.seat.facing,
            occupied:
              actor.cell.x === member.seat.cell.x &&
              actor.cell.y === member.seat.cell.y &&
              (actor.action === "seated-work" || actor.action === "idle"),
          }),
        ];
      });
      return Object.freeze({
        id: furniture.id,
        kind: furniture.kind,
        accent: furniture.accent,
        position: geometry.position,
        size: geometry.size,
        zIndex: Math.round(geometry.bottom * 1000),
        seats: Object.freeze(seats),
      });
    }),
  );
}
