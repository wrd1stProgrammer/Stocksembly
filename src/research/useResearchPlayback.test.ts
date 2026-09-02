import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixturePayload } from "./compositions/fixture";
import { OFFICE_CLOCK_CONTRACT } from "./officeChoreography";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import { useResearchPlayback } from "./useResearchPlayback";

type RafDriver = {
  readonly advanceBy: (elapsedMs: number) => void;
  readonly advanceTicks: (ticks: number) => void;
  readonly hasQueuedFrame: () => boolean;
};

function installRafDriver(): RafDriver {
  let queuedCallback: FrameRequestCallback | undefined;
  let timestamp = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      queuedCallback = callback;
      return 1;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn(() => {
      queuedCallback = undefined;
    }),
  );

  const advanceBy = (elapsedMs: number): void => {
    const callback = queuedCallback;
    if (!callback) throw new RangeError("No animation frame is queued");
    queuedCallback = undefined;
    timestamp += elapsedMs;
    act(() => callback(timestamp));
  };

  return {
    advanceBy,
    hasQueuedFrame: () => queuedCallback !== undefined,
    advanceTicks(ticks: number) {
      let remaining = ticks;
      while (remaining > 0) {
        const step = Math.min(remaining, OFFICE_CLOCK_CONTRACT.maxCatchUpTicks);
        advanceBy(step * OFFICE_CLOCK_CONTRACT.tickMs);
        remaining -= step;
      }
    },
  };
}

describe("useResearchPlayback", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses the fixed simulator clock and exposes an immutable initial snapshot", () => {
    // Given
    const { result } = renderHook(() => useResearchPlayback(fixturePayload));

    // When
    const playback = result.current;

    // Then
    expect(playback.tick).toBe(0);
    expect(playback.beatId).toBe("briefing");
    expect(playback.elapsedMs).toBe(0);
    expect(playback.snapshot.actors).toHaveLength(
      OFFICE_SCENE_MANIFEST.roster.length,
    );
    expect(Object.isFrozen(playback.snapshot)).toBe(true);
    expect(Object.isFrozen(playback.snapshot.actors[0])).toBe(true);
    expect(playback.current.id).toBe("mandate");
  });

  it("freezes tick and actor positions while paused, then resumes from the same state", () => {
    // Given
    const clock = installRafDriver();
    const { result } = renderHook(() => useResearchPlayback(fixturePayload));
    clock.advanceBy(0);
    clock.advanceTicks(12);
    const beforePause = result.current.snapshot;

    // When
    act(() => result.current.pause());
    clock.advanceBy(50 * 20);
    const frozen = result.current.snapshot;

    // Then
    expect(result.current.isPaused).toBe(true);
    expect(frozen.tick).toBe(beforePause.tick);
    expect(frozen.actors).toEqual(beforePause.actors);

    // When
    act(() => result.current.resume());
    clock.advanceBy(OFFICE_CLOCK_CONTRACT.tickMs);

    // Then
    expect(result.current.isPaused).toBe(false);
    expect(result.current.tick).toBe(beforePause.tick + 1);
  });

  it("caps a 275ms animation frame at five fixed ticks and drops the excess", () => {
    // Given
    const clock = installRafDriver();
    const { result } = renderHook(() => useResearchPlayback(fixturePayload));
    clock.advanceBy(0);

    // When
    clock.advanceBy(275);

    // Then
    expect(result.current.tick).toBe(5);
    expect(result.current.renderPreviousSnapshot.tick).toBe(4);
    expect(result.current.renderInterpolationAlpha).toBe(0);
  });

  it("drops a very large background gap without carrying catch-up debt", () => {
    // Given
    const clock = installRafDriver();
    const { result } = renderHook(() => useResearchPlayback(fixturePayload));
    clock.advanceBy(0);

    // When
    clock.advanceBy(60_000);
    const afterGap = result.current.tick;
    clock.advanceBy(OFFICE_CLOCK_CONTRACT.tickMs);

    // Then
    expect(afterGap).toBe(OFFICE_CLOCK_CONTRACT.maxCatchUpTicks);
    expect(result.current.tick).toBe(OFFICE_CLOCK_CONTRACT.maxCatchUpTicks + 1);
    expect(result.current.renderInterpolationAlpha).toBe(0);
  });

  it("exposes bounded interpolation between immutable adjacent snapshots", () => {
    // Given
    const clock = installRafDriver();
    const { result } = renderHook(() => useResearchPlayback(fixturePayload));
    clock.advanceBy(0);

    // When
    clock.advanceBy(75);

    // Then
    expect(result.current.tick).toBe(1);
    expect(result.current.renderPreviousSnapshot.tick).toBe(0);
    expect(result.current.renderInterpolationAlpha).toBe(0.5);
    expect(result.current.renderInterpolationAlpha).toBeGreaterThanOrEqual(0);
    expect(result.current.renderInterpolationAlpha).toBeLessThan(1);
    expect(Object.isFrozen(result.current.renderPreviousSnapshot)).toBe(true);
    expect(Object.isFrozen(result.current.snapshot)).toBe(true);
  });
});

describe("useResearchPlayback reduced motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("walks actors in when the viewer has no motion preference", () => {
    // Given
    const raf = installRafDriver();
    const { result } = renderHook(() => useResearchPlayback(fixturePayload));

    // When
    raf.advanceBy(0);
    raf.advanceTicks(50);

    // Then
    expect(result.current.tick).toBe(50);
    expect(result.current.walkingAgentIds.length).toBeGreaterThan(0);
  });

  it("snaps actors to their destinations when the viewer prefers reduced motion", () => {
    // Given
    const raf = installRafDriver();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const { result } = renderHook(() => useResearchPlayback(fixturePayload));

    // When
    raf.advanceBy(0);
    raf.advanceTicks(50);

    // Then: same clock, no walking frames.
    expect(result.current.tick).toBe(50);
    expect(result.current.walkingAgentIds).toEqual([]);
    expect(
      result.current.snapshot.actors.every((actor) => actor.motion === null),
    ).toBe(true);
  });
});
