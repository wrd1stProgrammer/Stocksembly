import { describe, expect, it } from "vitest";
import {
  ACTOR_ATLAS,
  actorFrame,
  actorWalkColumns,
  validateActorAtlas,
} from "./officeActorAtlas";

describe("office actor atlas", () => {
  it("has padded 160x192 cells and all four idle, walking, and seated directions", () => {
    expect(ACTOR_ATLAS.frame).toEqual({ width: 160, height: 192 });
    for (const direction of ["down", "left", "right", "up"] as const) {
      expect(actorFrame("walk", direction, 0)).toBeDefined();
      expect(actorFrame("idle", direction, 0)).toBeDefined();
      expect(actorFrame("sit", direction, 0)).toBeDefined();
    }
    expect(validateActorAtlas()).toEqual([]);
  });

  it("uses the legible production world scale", () => {
    expect(ACTOR_ATLAS.displayScale).toBe(0.46);
  });

  it("maps seated side profiles toward their named direction", () => {
    expect(actorFrame("sit", "left", 0)).toMatchObject({
      row: 2,
      column: 3,
    });
    expect(actorFrame("sit", "right", 0)).toMatchObject({
      row: 1,
      column: 3,
    });
    expect(actorFrame("sit", "down", 0)).toMatchObject({ row: 0, column: 3 });
    expect(actorFrame("sit", "up", 0)).toMatchObject({ row: 3, column: 3 });
  });

  it("keeps the authored stride for both side-facing rows", () => {
    expect(actorWalkColumns("left")).toEqual([0, 1, 2, 1]);
    expect(actorWalkColumns("right")).toEqual([0, 1, 2, 1]);
  });
});
