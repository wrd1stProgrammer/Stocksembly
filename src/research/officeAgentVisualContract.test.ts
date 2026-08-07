import { describe, expect, it } from "vitest";
import {
  OFFICE_AGENT_PERSONAS,
  OFFICE_AGENT_VISUAL_CONTRACT,
} from "./officeAgentVisualContract";
import { OFFICE_CLOCK_CONTRACT } from "./officeChoreography";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

describe("office agent visual contract", () => {
  it("defines a persona for every office actor", () => {
    expect(Object.keys(OFFICE_AGENT_PERSONAS).sort()).toEqual(
      OFFICE_SCENE_MANIFEST.roster.map((member) => member.id).sort(),
    );
  });

  it("matches the authored gait to the two-tick cell traversal", () => {
    expect(OFFICE_AGENT_VISUAL_CONTRACT.motion.cellDurationMs).toBe(
      OFFICE_CLOCK_CONTRACT.tickMs * 2,
    );
    expect(OFFICE_AGENT_VISUAL_CONTRACT.clips.walk.frames).toBe(4);
  });

  it("requires distinct seated conversation clips", () => {
    expect(OFFICE_AGENT_VISUAL_CONTRACT.clips["seated-talk"]).toBeDefined();
    expect(OFFICE_AGENT_VISUAL_CONTRACT.clips["seated-listen"]).toBeDefined();
  });
});
