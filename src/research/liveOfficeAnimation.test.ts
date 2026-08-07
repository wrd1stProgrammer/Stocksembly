import { describe, expect, it } from "vitest";
import { fixturePayload } from "./compositions/fixture";
import {
  advanceLiveOfficeFrame,
  advanceLiveOfficeFrameForDisplay,
  createLiveOfficeFrame,
  durablePublicEventTargetTick,
} from "./liveOfficeAnimation";
import { OFFICE_CLOCK_CONTRACT } from "./officeChoreography";

describe("live office animation", () => {
  it("holds at the latest durable public event", () => {
    // Given
    const committedEvents = fixturePayload.data.playbackEvents.slice(0, 3);

    // When
    const targetTick = durablePublicEventTargetTick(committedEvents);

    // Then
    expect(targetTick).toBe(140);
  });

  it("does not advance before a durable public event exists", () => {
    // Given
    const committedEvents = fixturePayload.data.playbackEvents.slice(0, 0);

    // When
    const targetTick = durablePublicEventTargetTick(committedEvents);

    // Then
    expect(targetTick).toBe(0);
  });

  it("walks toward a newly committed target without jumping or overshooting", () => {
    // Given
    const initial = createLiveOfficeFrame(360);

    // When
    const next = advanceLiveOfficeFrame(
      initial,
      520,
      OFFICE_CLOCK_CONTRACT.tickMs / 2,
    );

    // Then
    expect(next.simulation.tick).toBe(360);
    expect(next.interpolation).toBeCloseTo(0.5);
    expect(next.simulation.tick).toBeLessThan(520);
  });

  it("caps catch-up at the latest durable target", () => {
    // Given
    const initial = createLiveOfficeFrame(518);

    // When
    const next = advanceLiveOfficeFrame(
      initial,
      520,
      OFFICE_CLOCK_CONTRACT.tickMs * 20,
    );

    // Then
    expect(next.simulation.tick).toBe(520);
  });

  it("animates a large published-event gap instead of snapping", () => {
    // Given
    const initial = createLiveOfficeFrame(220);

    // When
    const next = advanceLiveOfficeFrameForDisplay(
      initial,
      OFFICE_CLOCK_CONTRACT.completeTick,
      OFFICE_CLOCK_CONTRACT.tickMs,
    );

    // Then
    expect(next.simulation.tick).toBe(221);
    expect(next.simulation.tick).toBeLessThan(
      OFFICE_CLOCK_CONTRACT.completeTick,
    );
  });
});
