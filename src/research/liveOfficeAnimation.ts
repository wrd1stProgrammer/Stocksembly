"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ResearchEventWithMode } from "./compositionMode";
import {
  DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER,
  OFFICE_CLOCK_CONTRACT,
  OFFICE_ENTRY_TIMELINE,
} from "./officeChoreography";
import { prefersReducedMotion } from "./officeReducedMotion";
import type { OfficeDepartmentId } from "./officeSceneManifest";
import {
  advanceOfficeFrame,
  createOfficeFrame,
  createOfficeSimulation,
  type OfficeFrame,
  officeSimulationSnapshot,
  setOfficeDepartmentReleaseOrder,
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

export function createLiveOfficeFrame(
  targetTick: number,
  departmentReleaseOrder: readonly OfficeDepartmentId[] = DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER,
  reducedMotion = false,
): OfficeFrame {
  let simulation = createOfficeSimulation({
    departmentReleaseOrder,
    reducedMotion,
  });
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

export function useLiveOfficeAnimation(
  targetTick: number,
  departmentReleaseOrder: readonly OfficeDepartmentId[] = DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER,
  playbackReady = true,
  completeEntrance = false,
) {
  const releaseOrderKey = departmentReleaseOrder.join("\u0000");
  const displayTargetTick =
    playbackReady && completeEntrance
      ? Math.max(targetTick, OFFICE_ENTRY_TIMELINE.endTick + 1)
      : targetTick;
  const [frame, setFrame] = useState(() =>
    createLiveOfficeFrame(
      playbackReady ? displayTargetTick : 0,
      departmentReleaseOrder,
      prefersReducedMotion(),
    ),
  );
  const frameRef = useRef(frame);

  useEffect(() => {
    const configuredReleaseOrder = (
      releaseOrderKey === "" ? [] : releaseOrderKey.split("\u0000")
    ) as readonly OfficeDepartmentId[];
    const configuredSimulation = setOfficeDepartmentReleaseOrder(
      frameRef.current.simulation,
      configuredReleaseOrder,
    );
    const configuredPreviousSimulation = setOfficeDepartmentReleaseOrder(
      frameRef.current.previousSimulation,
      configuredReleaseOrder,
    );
    if (
      configuredSimulation !== frameRef.current.simulation ||
      configuredPreviousSimulation !== frameRef.current.previousSimulation
    ) {
      frameRef.current = Object.freeze({
        ...frameRef.current,
        simulation: configuredSimulation,
        previousSimulation: configuredPreviousSimulation,
      });
      setFrame(frameRef.current);
    }
    if (!playbackReady || frameRef.current.simulation.tick >= displayTargetTick)
      return;
    let animationFrame = 0;
    let previousTimestamp: number | undefined;
    const advance = (timestamp: number): void => {
      if (previousTimestamp !== undefined) {
        const next = advanceLiveOfficeFrameForDisplay(
          frameRef.current,
          displayTargetTick,
          timestamp - previousTimestamp,
        );
        if (next !== frameRef.current) {
          frameRef.current = next;
          setFrame((current) => (current === next ? current : next));
        }
      }
      previousTimestamp = timestamp;
      if (frameRef.current.simulation.tick < displayTargetTick)
        animationFrame = window.requestAnimationFrame(advance);
    };
    animationFrame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [displayTargetTick, playbackReady, releaseOrderKey]);

  return useMemo(
    () => ({
      snapshot: officeSimulationSnapshot(frame.simulation),
      previousSnapshot: officeSimulationSnapshot(frame.previousSimulation),
      interpolation: frame.interpolation,
    }),
    [frame],
  );
}
