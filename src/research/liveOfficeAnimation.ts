"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ResearchEventWithMode } from "./compositionMode";
import { OFFICE_CLOCK_CONTRACT } from "./officeChoreography";
import {
  advanceOfficeFrame,
  createOfficeFrame,
  createOfficeSimulation,
  type OfficeFrame,
  officeSimulationSnapshot,
  stepOfficeSimulation,
} from "./officeSimulation";

export function durablePublicEventTargetTick(
  events: readonly ResearchEventWithMode[],
): number {
  return Math.min(
    events.reduce(
      (latestTick, event) => Math.max(latestTick, event.tick ?? 0),
      0,
    ),
    OFFICE_CLOCK_CONTRACT.completeTick,
  );
}

export function createLiveOfficeFrame(targetTick: number): OfficeFrame {
  let simulation = createOfficeSimulation();
  while (simulation.tick < targetTick)
    simulation = stepOfficeSimulation(simulation);
  return createOfficeFrame(simulation);
}

export function advanceLiveOfficeFrame(
  frame: OfficeFrame,
  targetTick: number,
  frameDeltaMs: number,
): OfficeFrame {
  const remainingTicks = targetTick - frame.simulation.tick;
  if (remainingTicks <= 0) return frame;
  const remainingDuration =
    remainingTicks * OFFICE_CLOCK_CONTRACT.tickMs - frame.accumulatorMs;
  return advanceOfficeFrame(
    frame,
    Math.min(Math.max(frameDeltaMs, 0), Math.max(remainingDuration, 0)),
  );
}

export function advanceLiveOfficeFrameForDisplay(
  frame: OfficeFrame,
  targetTick: number,
  frameDeltaMs: number,
): OfficeFrame {
  return advanceLiveOfficeFrame(frame, targetTick, frameDeltaMs);
}

export function useLiveOfficeAnimation(targetTick: number) {
  const [frame, setFrame] = useState(() => createLiveOfficeFrame(targetTick));
  const frameRef = useRef(frame);

  useEffect(() => {
    if (frameRef.current.simulation.tick >= targetTick) return;
    let animationFrame = 0;
    let previousTimestamp: number | undefined;
    const advance = (timestamp: number): void => {
      if (previousTimestamp !== undefined) {
        const next = advanceLiveOfficeFrameForDisplay(
          frameRef.current,
          targetTick,
          timestamp - previousTimestamp,
        );
        if (next !== frameRef.current) {
          frameRef.current = next;
          setFrame((current) => (current === next ? current : next));
        }
      }
      previousTimestamp = timestamp;
      if (frameRef.current.simulation.tick < targetTick)
        animationFrame = window.requestAnimationFrame(advance);
    };
    animationFrame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [targetTick]);

  return useMemo(
    () => ({
      snapshot: officeSimulationSnapshot(frame.simulation),
      previousSnapshot: officeSimulationSnapshot(frame.previousSimulation),
      interpolation: frame.interpolation,
    }),
    [frame],
  );
}
