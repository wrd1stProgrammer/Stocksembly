import { describe, expect, it } from "vitest";
import { routeCollisions } from "./officeCollision";
import { agentPlacements } from "./officeGameConfig";

describe("office collision routes", () => {
  it("keeps every authored route out of the six role desks", () => {
    for (const placement of Object.values(agentPlacements)) {
      expect(routeCollisions([placement.home, ...placement.route])).toEqual([]);
    }
  });
});
