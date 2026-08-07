import { describe, expect, it } from "vitest";
import {
  OFFICE_MEETING_RELEASE_TICKS,
  OFFICE_MEETING_TIMELINE,
  officeMeetingPhaseAt,
} from "./officeMeetingChoreography";

describe("office meeting choreography", () => {
  it("stages representatives instead of releasing the full committee at once", () => {
    expect(new Set(Object.values(OFFICE_MEETING_RELEASE_TICKS)).size).toBe(4);
    expect(OFFICE_MEETING_RELEASE_TICKS.chair).toBe(
      OFFICE_MEETING_RELEASE_TICKS.market,
    );
    expect(OFFICE_MEETING_RELEASE_TICKS.risk).toBeGreaterThan(
      OFFICE_MEETING_RELEASE_TICKS.company ?? 0,
    );
  });

  it("exposes durable visual phases through completion", () => {
    expect(officeMeetingPhaseAt(1079)).toBe("inactive");
    expect(officeMeetingPhaseAt(1080)).toBe("assembling");
    expect(officeMeetingPhaseAt(1200)).toBe("settling");
    expect(officeMeetingPhaseAt(1260)).toBe("opening");
    expect(officeMeetingPhaseAt(1300)).toBe("department-reports");
    expect(officeMeetingPhaseAt(1520)).toBe("challenge-round");
    expect(officeMeetingPhaseAt(1540)).toBe("chair-synthesis");
    expect(officeMeetingPhaseAt(OFFICE_MEETING_TIMELINE.completeTick)).toBe(
      "complete",
    );
  });
});
