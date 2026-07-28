import { describe, expect, it } from "vitest";
import { agentAnimations, frameFitsSheet } from "./officeGameAnimations";
import {
  agentPlacements,
  directionBetween,
  distanceBetween,
  OFFICE_SIZE,
} from "./officeGameConfig";

describe("office game navigation", () => {
  it("chooses a distinct sprite direction from the dominant axis", () => {
    expect(directionBetween({ x: 0, y: 0 }, { x: 9, y: 2 })).toBe("right");
    expect(directionBetween({ x: 9, y: 2 }, { x: 0, y: 0 })).toBe("left");
    expect(directionBetween({ x: 0, y: 9 }, { x: 2, y: 0 })).toBe("up");
    expect(directionBetween({ x: 2, y: 0 }, { x: 0, y: 9 })).toBe("down");
  });

  it("ends every authored route at its standing meeting spot", () => {
    for (const placement of Object.values(agentPlacements)) {
      expect(placement.route.at(-1)).toEqual(placement.meeting);
    }
  });

  it("measures movement in native logical pixels", () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("uses the background artwork at its native resolution", () => {
    expect(OFFICE_SIZE).toEqual({ width: 1448, height: 1086 });
  });

  it("authors only orthogonal, integer corridor segments", () => {
    for (const placement of Object.values(agentPlacements)) {
      const points = [placement.home, ...placement.route];
      for (const point of points) {
        expect(Number.isInteger(point.x)).toBe(true);
        expect(Number.isInteger(point.y)).toBe(true);
      }
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        if (!previous || !current) throw new Error("Missing route point");
        expect(previous.x === current.x || previous.y === current.y).toBe(true);
      }
    }
  });

  it("defines an explicit inward-facing direction for every standing spot", () => {
    expect(agentPlacements.market.meetingDirection).toBe("down");
    expect(agentPlacements.company.meetingDirection).toBe("down");
    expect(agentPlacements.financial.meetingDirection).toBe("right");
    expect(agentPlacements.valuation.meetingDirection).toBe("left");
    expect(agentPlacements.risk.meetingDirection).toBe("up");
    expect(agentPlacements.chair.meetingDirection).toBe("up");
  });

  it("keeps every named animation inside the padded four-column atlas", () => {
    for (const frames of Object.values(agentAnimations)) {
      for (const frame of frames) {
        expect(frameFitsSheet(frame)).toBe(true);
      }
    }
  });
});
