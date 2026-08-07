import { describe, expect, it } from "vitest";
import { OFFICE_ENTITY_MANIFEST } from "./officeEntityManifest";
import { OFFICE_NAVIGATION_GRID, officeCellKey } from "./officeNavigation";

describe("office entity manifest", () => {
  it("keeps room signs visual-only and outside collision authority", () => {
    const signs = OFFICE_ENTITY_MANIFEST.filter(
      (entity) => entity.kind === "room-sign",
    );
    expect(signs).toHaveLength(5);
    expect(signs.every((entity) => entity.collisionFootprint === null)).toBe(
      true,
    );
    expect(signs.every((entity) => entity.size.height >= 66)).toBe(true);
  });

  it("gives the evidence forum five unique walkable interaction anchors", () => {
    const forum = OFFICE_ENTITY_MANIFEST.find(
      (entity) => entity.kind === "evidence-forum",
    );
    if (!forum) throw new RangeError("Missing evidence forum");
    const walkable = new Set(
      OFFICE_NAVIGATION_GRID.walkableCells.map(officeCellKey),
    );
    const anchors = forum.interactionAnchors.map(({ cell }) =>
      officeCellKey(cell),
    );
    expect(anchors).toHaveLength(5);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(anchors.every((anchor) => walkable.has(anchor))).toBe(true);
  });
});
