import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixturePayload } from "./compositions/fixture";
import {
  advanceLiveOfficeFrame,
  advanceLiveOfficeFrameForDisplay,
  createLiveOfficeFrame,
  durablePublicEventTargetTick,
  useLiveOfficeAnimation,
} from "./liveOfficeAnimation";
import { OFFICE_CLOCK_CONTRACT } from "./officeChoreography";

describe("live office animation", () => {
  afterEach(() => vi.unstubAllGlobals());

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

  it("stops requesting display frames after reaching the durable target", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let requestId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      requestId += 1;
      callbacks.set(requestId, callback);
      return requestId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    const runNextFrame = (timestamp: number) => {
      const next = callbacks.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;
      if (next === undefined) throw new TypeError("animation frame missing");
      callbacks.delete(next[0]);
      act(() => next[1](timestamp));
    };

    const view = renderHook(({ tick }) => useLiveOfficeAnimation(tick), {
      initialProps: { tick: 0 },
    });
    view.rerender({ tick: 1 });
    runNextFrame(0);
    runNextFrame(OFFICE_CLOCK_CONTRACT.tickMs);

    expect(view.result.current.snapshot.tick).toBe(1);
    expect(callbacks).toHaveLength(0);
    view.unmount();
  });

  it("keeps the entrance queue still until the rendered office reports ready", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let requestId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      requestId += 1;
      callbacks.set(requestId, callback);
      return requestId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    const runNextFrame = (timestamp: number) => {
      const next = callbacks.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;
      if (next === undefined) throw new TypeError("animation frame missing");
      callbacks.delete(next[0]);
      act(() => next[1](timestamp));
    };

    const view = renderHook(
      ({ ready }) => useLiveOfficeAnimation(80, undefined, ready),
      { initialProps: { ready: false } },
    );

    expect(view.result.current.snapshot.tick).toBe(0);
    expect(callbacks).toHaveLength(0);

    view.rerender({ ready: true });
    runNextFrame(0);
    runNextFrame(OFFICE_CLOCK_CONTRACT.tickMs);

    expect(view.result.current.snapshot.tick).toBe(1);
    view.unmount();
  });

  it("finishes seating the entrance even while the research run is still queued", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let requestId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      requestId += 1;
      callbacks.set(requestId, callback);
      return requestId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    const runNextFrame = (timestamp: number) => {
      const next = callbacks.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;
      if (next === undefined) throw new TypeError("animation frame missing");
      callbacks.delete(next[0]);
      act(() => next[1](timestamp));
    };

    const view = renderHook(
      ({ ready }) => useLiveOfficeAnimation(0, undefined, ready, true),
      { initialProps: { ready: false } },
    );

    view.rerender({ ready: true });
    runNextFrame(0);
    for (let tick = 1; tick <= 120; tick += 1) {
      runNextFrame(tick * OFFICE_CLOCK_CONTRACT.tickMs);
    }

    expect(view.result.current.snapshot.tick).toBe(120);
    expect(
      view.result.current.snapshot.actors
        .filter((actor) => actor.department !== "chair")
        .every(
          (actor) => actor.action === "seated-work" && actor.motion === null,
        ),
    ).toBe(true);
    expect(callbacks).toHaveLength(0);
    view.unmount();
  });
});
