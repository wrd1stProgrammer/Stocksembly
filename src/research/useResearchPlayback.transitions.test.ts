import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixturePayload } from "./compositions/fixture";
import { OFFICE_CLOCK_CONTRACT } from "./officeChoreography";
import { EXPECTED_OFFICE_EVENT_LEDGER } from "./officeSimulationV7TestSupport";
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

describe("useResearchPlayback transitions", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps actor scale, facing, and occupancy canonical during interpolation", () => {
    const clock = installRafDriver();
    const { result } = renderHook(() => useResearchPlayback(fixturePayload));
    clock.advanceBy(0);
    clock.advanceTicks(500);
    const canonicalSnapshot = result.current.snapshot;
    const previousSnapshot = result.current.renderPreviousSnapshot;

    clock.advanceBy(25);

    expect(result.current.renderInterpolationAlpha).toBe(0.5);
    expect(result.current.snapshot).toBe(canonicalSnapshot);
    expect(result.current.renderPreviousSnapshot).toBe(previousSnapshot);
    expect(previousSnapshot.tick).toBe(canonicalSnapshot.tick - 1);
    const currentMarket = canonicalSnapshot.actors.find(
      (actor) => actor.id === "market",
    );
    const previousMarket = previousSnapshot.actors.find(
      (actor) => actor.id === "market",
    );
    expect(currentMarket?.action).toBe("orient");
    expect(previousMarket?.action).not.toBe(currentMarket?.action);
    expect(
      new Set(canonicalSnapshot.actors.map((actor) => actor.scale)),
    ).toEqual(new Set([1]));
    expect(
      canonicalSnapshot.actors.map(({ id, facing }) => [id, facing]),
    ).toEqual(
      result.current.snapshot.actors.map(({ id, facing }) => [id, facing]),
    );
    expect(canonicalSnapshot.occupancy).toEqual(
      canonicalSnapshot.actors.map(({ id, cell }) => ({ actorId: id, cell })),
    );
  });

  it("freezes the partial accumulator while paused", () => {
    const clock = installRafDriver();
    const { result } = renderHook(() => useResearchPlayback(fixturePayload));
    clock.advanceBy(0);
    clock.advanceBy(25);
    const alphaBeforePause = result.current.renderInterpolationAlpha;

    act(() => result.current.pause());
    clock.advanceBy(60_000);

    expect(result.current.tick).toBe(0);
    expect(result.current.renderInterpolationAlpha).toBe(alphaBeforePause);
    expect(result.current.renderPreviousSnapshot).toEqual(
      result.current.snapshot,
    );
  });

  it("skips to the complete public ledger and replay restores tick, occupancy, and report lock", () => {
    const clock = installRafDriver();
    const { result } = renderHook(() => useResearchPlayback(fixturePayload));
    const initialSnapshot = result.current.snapshot;
    expect(clock.hasQueuedFrame()).toBe(true);

    act(() => result.current.skip());

    expect(result.current.tick).toBe(OFFICE_CLOCK_CONTRACT.completeTick);
    expect(result.current.isComplete).toBe(true);
    expect(result.current.reportAvailable).toBe(true);
    expect(result.current.publicLedger.map((event) => event.id)).toEqual(
      EXPECTED_OFFICE_EVENT_LEDGER,
    );
    expect(result.current.snapshot.visibleEventIds).toEqual(
      EXPECTED_OFFICE_EVENT_LEDGER,
    );
    expect(result.current.renderPreviousSnapshot).toEqual(
      result.current.snapshot,
    );
    expect(result.current.renderInterpolationAlpha).toBe(0);
    expect(clock.hasQueuedFrame()).toBe(false);

    act(() => result.current.replay());

    expect(result.current.tick).toBe(0);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.reportAvailable).toBe(false);
    expect(result.current.snapshot).toEqual(initialSnapshot);
    expect(result.current.publicLedger.map((event) => event.id)).toEqual([
      "mandate",
    ]);
    expect(result.current.renderPreviousSnapshot).toEqual(
      result.current.snapshot,
    );
    expect(result.current.renderInterpolationAlpha).toBe(0);
    expect(clock.hasQueuedFrame()).toBe(true);
    clock.advanceBy(0);
    clock.advanceBy(OFFICE_CLOCK_CONTRACT.tickMs);
    expect(result.current.tick).toBe(1);
  });

  it("derives concurrent departments, both visit waves, and representative-only gathering from snapshots", () => {
    const clock = installRafDriver();
    const { result } = renderHook(() => useResearchPlayback(fixturePayload));
    clock.advanceBy(0);
    clock.advanceTicks(500);

    expect(result.current.beatId).toBe("visit-wave-a");
    expect(result.current.departmentStatuses).toHaveLength(4);
    expect(
      result.current.departmentStatuses.every(
        (status) => status.memberCount > 0,
      ),
    ).toBe(true);
    expect(result.current.visitAnnotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ visitorId: "market", hostId: "company" }),
        expect.objectContaining({ visitorId: "financial", hostId: "risk" }),
      ]),
    );

    clock.advanceTicks(860 - result.current.tick);

    expect(result.current.beatId).toBe("visit-wave-b");
    expect(result.current.visitAnnotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: "visit-wave-b",
          visitorId: "company",
          hostId: "financial",
          active: true,
        }),
        expect.objectContaining({
          phase: "visit-wave-b",
          visitorId: "risk",
          hostId: "market",
          active: true,
        }),
      ]),
    );

    clock.advanceTicks(1080 - result.current.tick);

    expect(result.current.beatId).toBe("representative-gathering");
    expect(result.current.gatheringRepresentativeIds).toEqual([
      "market",
      "company",
      "financial",
      "risk",
      "chair",
    ]);
    expect(result.current.gatheringNonRepresentativeIds).toEqual([
      "market_news",
      "company_product",
      "company_competition",
      "valuation",
      "financial_quality",
      "risk_policy",
    ]);
  });
});
