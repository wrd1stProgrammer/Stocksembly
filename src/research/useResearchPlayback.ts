"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ResearchCompositionPayload } from "./compositions/types";
import {
  advanceLiveOfficeFrame,
  durablePublicEventTargetTick,
} from "./liveOfficeAnimation";
import { OFFICE_CLOCK_CONTRACT } from "./officeChoreography";
import {
  activeIdsForSnapshot,
  currentResearchEvent,
  departmentStatuses,
  eventLedger,
  gatheringIds,
  progressAtTick,
  visitAnnotations,
} from "./officePlaybackView";
import { prefersReducedMotion } from "./officeReducedMotion";
import {
  createOfficeFrame,
  createOfficeSimulation,
  officeSimulationSnapshot,
  replayOfficeSimulation,
  setOfficeSimulationPaused,
  skipOfficeSimulation,
} from "./officeSimulation";
import type { ResearchPlayback } from "./types";

export function useResearchPlayback(
  payload: ResearchCompositionPayload,
  initialComplete = false,
): ResearchPlayback {
  const [frame, setFrame] = useState(() => {
    // The simulation owns reduced motion: with it set, actors snap to their
    // destinations instead of walking cell by cell, while ticks, events and
    // final ownership stay identical.
    const simulation = createOfficeSimulation({
      reducedMotion: prefersReducedMotion(),
    });
    return createOfficeFrame(
      initialComplete ? skipOfficeSimulation(simulation) : simulation,
    );
  });
  const frameRef = useRef(frame);
  const simulation = frame.simulation;
  const durableTargetTick = useMemo(
    () => durablePublicEventTargetTick(payload.data.playbackEvents),
    [payload.data.playbackEvents],
  );
  const isComplete = simulation.tick === OFFICE_CLOCK_CONTRACT.completeTick;

  const replaceFrame = useCallback((next: typeof frame) => {
    frameRef.current = next;
    setFrame(next);
  }, []);

  useEffect(() => {
    if (isComplete) return;
    let previousTimestamp: number | undefined;
    let animationFrame = 0;
    const advance = (timestamp: number): void => {
      if (previousTimestamp !== undefined) {
        replaceFrame(
          advanceLiveOfficeFrame(
            frameRef.current,
            durableTargetTick,
            timestamp - previousTimestamp,
          ),
        );
      }
      previousTimestamp = timestamp;
      animationFrame = window.requestAnimationFrame(advance);
    };
    animationFrame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [durableTargetTick, isComplete, replaceFrame]);

  const pause = useCallback(() => {
    const current = frameRef.current;
    replaceFrame(
      Object.freeze({
        ...current,
        simulation: setOfficeSimulationPaused(current.simulation, true),
      }),
    );
  }, [replaceFrame]);
  const resume = useCallback(() => {
    const current = frameRef.current;
    replaceFrame(
      Object.freeze({
        ...current,
        simulation: setOfficeSimulationPaused(current.simulation, false),
      }),
    );
  }, [replaceFrame]);
  const replay = useCallback(() => {
    replaceFrame(
      createOfficeFrame(replayOfficeSimulation(frameRef.current.simulation)),
    );
  }, [replaceFrame]);
  const skip = useCallback(() => {
    replaceFrame(
      createOfficeFrame(skipOfficeSimulation(frameRef.current.simulation)),
    );
  }, [replaceFrame]);

  const snapshot = useMemo(
    () => officeSimulationSnapshot(simulation),
    [simulation],
  );
  const renderPreviousSnapshot = useMemo(
    () => officeSimulationSnapshot(frame.previousSimulation),
    [frame.previousSimulation],
  );
  const ledger = useMemo(
    () => eventLedger(snapshot, payload.data.playbackEvents),
    [payload.data.playbackEvents, snapshot],
  );
  const currentBase = useMemo(
    () => currentResearchEvent(snapshot, payload.data.playbackEvents),
    [payload.data.playbackEvents, snapshot],
  );
  const ids = useMemo(() => activeIdsForSnapshot(snapshot), [snapshot]);
  const gathering = useMemo(() => gatheringIds(snapshot), [snapshot]);
  const departments = useMemo(() => departmentStatuses(snapshot), [snapshot]);
  const visits = useMemo(() => visitAnnotations(snapshot), [snapshot]);
  const progress = progressAtTick(snapshot.tick);

  return useMemo(
    () => ({
      index: snapshot.tick,
      tick: snapshot.tick,
      beatId: snapshot.beatId,
      elapsedMs: snapshot.tick * OFFICE_CLOCK_CONTRACT.tickMs,
      progress,
      isPaused: simulation.paused,
      isComplete,
      reportAvailable: isComplete,
      snapshot,
      renderPreviousSnapshot,
      renderInterpolationAlpha: frame.interpolation,
      current: currentBase,
      visibleEvents: ledger,
      publicLedger: ledger,
      activeAgentIds: ids.active,
      walkingAgentIds: ids.walking,
      completedAgentIds: ids.completed,
      departmentStatuses: departments,
      visitAnnotations: visits,
      gatheringRepresentativeIds: gathering.representatives,
      gatheringNonRepresentativeIds: gathering.nonRepresentatives,
      pause,
      resume,
      replay,
      skip,
      completeNow: skip,
    }),
    [
      currentBase,
      departments,
      gathering,
      ids,
      isComplete,
      ledger,
      pause,
      progress,
      renderPreviousSnapshot,
      replay,
      resume,
      simulation.paused,
      skip,
      snapshot,
      frame.interpolation,
      visits,
    ],
  );
}
