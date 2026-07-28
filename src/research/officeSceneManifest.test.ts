import { describe, expect, it } from "vitest";
import {
  AGENT_IDS,
  LEGACY_AGENT_IDS,
  MEETING_SPOTS,
  OFFICE_SCENE_ASSETS,
  SEAT_MANIFEST,
  seatFor,
  validateOfficeSceneManifest,
} from "./officeSceneManifest";

describe("office scene manifest", () => {
  it("defines one persistent work seat and one standing spot per agent", () => {
    expect(Object.keys(SEAT_MANIFEST)).toHaveLength(AGENT_IDS.length);
    expect(Object.keys(MEETING_SPOTS)).toHaveLength(AGENT_IDS.length);
    for (const agentId of AGENT_IDS) {
      expect(SEAT_MANIFEST[`${agentId}:work`]).toBeDefined();
      expect(MEETING_SPOTS[agentId]).toBeDefined();
    }
  });

  it("keeps labels and public-status bubbles above every seated actor", () => {
    for (const seat of Object.values(SEAT_MANIFEST)) {
      expect(seat.labelOffset.y).toBeLessThan(seat.headOffset.y);
      expect(seat.bubbleOffset.y).toBeLessThan(seat.labelOffset.y);
      expect(seat.layers.chair).toBeLessThan(seat.layers.actor);
      expect(seat.layers.actor).toBeLessThan(seat.layers.label);
      expect(seat.layers.label).toBeLessThan(seat.layers.bubble);
    }
  });

  it("uses only v6 full-bleed assets and no committee furniture", () => {
    expect(OFFICE_SCENE_ASSETS.base).toBe("/research/office-v6/base.png");
    expect(Object.keys(OFFICE_SCENE_ASSETS)).not.toContain("tableBack");
    expect(Object.keys(OFFICE_SCENE_ASSETS)).not.toContain("tableFront");
  });

  it("keeps the six standing spots separated and inward-facing", () => {
    const spots = LEGACY_AGENT_IDS.map((agentId) => MEETING_SPOTS[agentId]);
    for (let index = 0; index < spots.length; index += 1) {
      const current = spots[index];
      if (!current) throw new Error("Missing meeting spot");
      for (
        let peerIndex = index + 1;
        peerIndex < spots.length;
        peerIndex += 1
      ) {
        const peer = spots[peerIndex];
        if (!peer) throw new Error("Missing peer meeting spot");
        expect(
          Math.hypot(
            current.point.x - peer.point.x,
            current.point.y - peer.point.y,
          ),
        ).toBeGreaterThanOrEqual(104);
      }
    }
    expect(validateOfficeSceneManifest()).toEqual([]);
  });

  it("uses simple chair proportions at work only", () => {
    for (const seat of Object.values(SEAT_MANIFEST)) {
      expect(seat.chairScale).toBe(1);
    }
  });

  it("orders each south input and monitor beyond its seated agent", () => {
    for (const agentId of ["risk", "chair"] as const) {
      const seat = seatFor(agentId);
      expect(seat.inputTarget.y).toBeGreaterThan(seat.hip.y);
      expect(seat.interactionTarget.y).toBeGreaterThan(seat.inputTarget.y);
    }
  });
});
