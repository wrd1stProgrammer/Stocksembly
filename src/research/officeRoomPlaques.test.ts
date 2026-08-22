import { describe, expect, it } from "vitest";
import { localizedRoomPlaque, OFFICE_ROOM_PLAQUES } from "./officeRoomPlaques";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

describe("office room plaques", () => {
  it("defines one bilingual plaque for every room", () => {
    expect(OFFICE_ROOM_PLAQUES.map((plaque) => plaque.id).sort()).toEqual(
      Object.keys(OFFICE_SCENE_MANIFEST.rooms).sort(),
    );
    for (const plaque of OFFICE_ROOM_PLAQUES) {
      expect(localizedRoomPlaque(plaque, "en").name).not.toBe("");
      expect(localizedRoomPlaque(plaque, "ko").name).not.toBe("");
      expect(localizedRoomPlaque(plaque, "en").scope).not.toBe("");
      expect(localizedRoomPlaque(plaque, "ko").scope).not.toBe("");
    }
  });

  it("keeps every plaque fully inside its authored room", () => {
    const { cellSize } = OFFICE_SCENE_MANIFEST.world;
    for (const plaque of OFFICE_ROOM_PLAQUES) {
      const room = OFFICE_SCENE_MANIFEST.rooms[plaque.id].bounds;
      const left = room.min.x * cellSize;
      const top = room.min.y * cellSize;
      const right = (room.max.x + 1) * cellSize;
      const bottom = (room.max.y + 1) * cellSize;
      expect(plaque.position.x).toBeGreaterThanOrEqual(left);
      expect(plaque.position.y).toBeGreaterThanOrEqual(top);
      expect(plaque.position.x + plaque.size.width).toBeLessThanOrEqual(right);
      expect(plaque.position.y + plaque.size.height).toBeLessThanOrEqual(
        bottom,
      );
    }
  });

  it("uses one top-left room inset and one plaque size", () => {
    const { cellSize } = OFFICE_SCENE_MANIFEST.world;
    for (const plaque of OFFICE_ROOM_PLAQUES) {
      const room = OFFICE_SCENE_MANIFEST.rooms[plaque.id].bounds;
      expect(plaque.position).toMatchObject({
        x: room.min.x * cellSize + 18,
        y: room.min.y * cellSize + 16,
      });
      expect(plaque.size).toMatchObject({ width: 250, height: 66 });
    }
  });

  it("reserves body clearance around every department interaction anchor", () => {
    const { cellSize } = OFFICE_SCENE_MANIFEST.world;
    const actorHalfWidth = 28;
    const pointForCell = (cell: {
      readonly x: number;
      readonly y: number;
    }) => ({
      x: cell.x * cellSize + cellSize / 2,
      y: (cell.y + 1) * cellSize,
    });
    for (const plaque of OFFICE_ROOM_PLAQUES) {
      if (plaque.id === "chair") continue;
      const department = OFFICE_SCENE_MANIFEST.departments[plaque.id];
      const interactionCells = [
        ...department.talkAnchors.map((anchor) => anchor.cell),
        department.visitorAnchor.cell,
      ];
      for (const cell of interactionCells) {
        const point = pointForCell(cell);
        const overlapsHorizontally =
          point.x + actorHalfWidth >= plaque.position.x &&
          point.x - actorHalfWidth <= plaque.position.x + plaque.size.width;
        const overlapsVertically =
          point.y >= plaque.position.y &&
          point.y - cellSize * 2.5 <= plaque.position.y + plaque.size.height;
        expect(overlapsHorizontally && overlapsVertically).toBe(false);
      }
    }
  });
});
