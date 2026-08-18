import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import {
  findOfficeRoute,
  isOfficeCellWalkable,
  OFFICE_NAVIGATION_GRID,
  officeCellKey,
} from "./officeNavigation";
import { type Cell, OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

describe("office v8 world contract", () => {
  it("uses the selected near-square architecture as the canonical world", () => {
    // Given
    const image = PNG.sync.read(
      fs.readFileSync(
        path.join(process.cwd(), "public/research/office-v8/base.png"),
      ),
    );

    // When / Then
    expect(OFFICE_SCENE_MANIFEST.version).toBe(9);
    expect(OFFICE_SCENE_MANIFEST.assets.base).toBe(
      "/research/office-v8/base.png",
    );
    expect(OFFICE_SCENE_MANIFEST.world).toMatchObject({
      width: image.width,
      height: image.height,
      cellSize: 32,
    });
  });

  it("keeps table footprints blocked while every seat and door stays walkable", () => {
    // Given
    const blocked = new Set(
      OFFICE_SCENE_MANIFEST.furniture.flatMap(({ footprint }) => {
        const cells: string[] = [];
        for (let y = footprint.min.y; y <= footprint.max.y; y += 1) {
          for (let x = footprint.min.x; x <= footprint.max.x; x += 1) {
            cells.push(officeCellKey({ x, y }));
          }
        }
        return cells;
      }),
    );

    // When / Then
    for (const cell of OFFICE_NAVIGATION_GRID.walkableCells) {
      expect(blocked.has(officeCellKey(cell))).toBe(false);
    }
    for (const member of OFFICE_SCENE_MANIFEST.roster) {
      expect(
        isOfficeCellWalkable(OFFICE_NAVIGATION_GRID, member.workSeat.cell),
      ).toBe(true);
      expect(
        isOfficeCellWalkable(OFFICE_NAVIGATION_GRID, member.meetingSeat.cell),
      ).toBe(true);
    }
    const doors: Cell[] = [];
    for (const room of Object.values(OFFICE_SCENE_MANIFEST.rooms)) {
      doors.push(...room.doors);
    }
    for (const door of doors) {
      expect(isOfficeCellWalkable(OFFICE_NAVIGATION_GRID, door)).toBe(true);
    }
  });

  it("routes cross-room travel through the declared portals", () => {
    // Given
    const from = OFFICE_SCENE_MANIFEST.roster[0].workSeat.cell;
    const to = OFFICE_SCENE_MANIFEST.roster[3].workSeat.cell;
    const portalKeys = new Set(
      [
        ...OFFICE_SCENE_MANIFEST.rooms.market.doors,
        ...OFFICE_SCENE_MANIFEST.rooms.chair.doors,
        ...OFFICE_SCENE_MANIFEST.rooms.company.doors,
      ].map(officeCellKey),
    );

    // When
    const route = findOfficeRoute(OFFICE_NAVIGATION_GRID, {
      from,
      to,
      blockedCells: [],
    });

    // Then
    expect(route.kind).toBe("found");
    if (route.kind !== "found") return;
    expect(
      route.path.filter((cell) => portalKeys.has(officeCellKey(cell))),
    ).toHaveLength(4);
  });
});
