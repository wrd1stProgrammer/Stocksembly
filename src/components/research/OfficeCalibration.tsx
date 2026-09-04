"use client";

import "../../styles/office-game.css";
import { useEffect, useRef, useState } from "react";
import {
  createOfficeSnapshotRenderer,
  type OfficeGameController,
  type OfficeGameInspection,
} from "../../research/officeGame";
import { prefersReducedMotion } from "../../research/officeReducedMotion";
import type { OfficeRendererCameraMode } from "../../research/officeRenderer";
import { OFFICE_SCENE_MANIFEST } from "../../research/officeSceneManifest";
import {
  createOfficeSimulation,
  type OfficeSimulationSnapshot,
  type OfficeSimulationState,
  officeSimulationSnapshot,
  replayOfficeSimulation,
  skipOfficeSimulation,
  stepOfficeSimulation,
} from "../../research/officeSimulation";

type CalibrationStatus = {
  readonly ready: boolean;
  readonly tick: number;
  readonly beatId: string;
  readonly error: boolean;
};

export type OfficeCalibrationBridge = {
  readonly advanceTicks: (ticks: number) => OfficeGameInspection;
  readonly inspect: () => OfficeGameInspection;
  readonly replay: () => OfficeSimulationSnapshot;
  readonly setCameraMode: (
    mode: OfficeRendererCameraMode,
  ) => OfficeGameInspection;
  readonly skip: () => OfficeSimulationSnapshot;
  readonly snapshot: () => OfficeSimulationSnapshot;
};

declare global {
  interface Window {
    __STOCKSEMBLY_OFFICE_TEST__?: OfficeCalibrationBridge;
  }
}

const initialStatus: CalibrationStatus = {
  ready: false,
  tick: 0,
  beatId: "briefing",
  error: false,
};

export function OfficeCalibration() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<OfficeCalibrationBridge | null>(null);
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let controller: OfficeGameController | null = null;
    const abortController = new AbortController();
    const reducedMotion = prefersReducedMotion();
    let simulation = createOfficeSimulation({ reducedMotion });
    let cameraMode: OfficeRendererCameraMode = "overview";

    void createOfficeSnapshotRenderer({
      host,
      locale: "en",
      reducedMotion,
      signal: abortController.signal,
    })
      .then((createdController) => {
        controller = createdController;
        if (cancelled) {
          createdController.destroy();
          controller = null;
          return;
        }
        const publish = (): OfficeSimulationSnapshot => {
          const snapshot = officeSimulationSnapshot(simulation);
          setStatus({
            ready: true,
            tick: snapshot.tick,
            beatId: snapshot.beatId,
            error: false,
          });
          return snapshot;
        };
        const render = (
          previousSnapshot?: OfficeSimulationSnapshot,
        ): OfficeGameInspection => {
          createdController.renderSnapshot(publish(), {
            ...(previousSnapshot ? { previousSnapshot } : {}),
            cameraMode,
          });
          return createdController.inspect();
        };
        const replaceSimulation = (
          next: OfficeSimulationState,
        ): OfficeSimulationSnapshot => {
          const previousSnapshot = officeSimulationSnapshot(simulation);
          simulation = next;
          render(previousSnapshot);
          return officeSimulationSnapshot(simulation);
        };
        const bridge: OfficeCalibrationBridge = Object.freeze({
          advanceTicks(ticks: number) {
            if (!Number.isInteger(ticks) || ticks < 0) {
              throw new RangeError("ticks must be a non-negative integer");
            }
            const previousSnapshot = officeSimulationSnapshot(simulation);
            for (let tick = 0; tick < ticks; tick += 1) {
              simulation = stepOfficeSimulation(simulation);
            }
            return render(previousSnapshot);
          },
          inspect: createdController.inspect,
          replay() {
            return replaceSimulation(replayOfficeSimulation(simulation));
          },
          setCameraMode(mode: OfficeRendererCameraMode) {
            cameraMode = mode;
            return render();
          },
          skip() {
            return replaceSimulation(skipOfficeSimulation(simulation));
          },
          snapshot() {
            return officeSimulationSnapshot(simulation);
          },
        });
        bridgeRef.current = bridge;
        window.__STOCKSEMBLY_OFFICE_TEST__ = bridge;
        render();
      })
      .catch((error: unknown) => {
        const aborted =
          error instanceof DOMException && error.name === "AbortError";
        if (!cancelled && !aborted) {
          setStatus((current) => ({ ...current, error: true }));
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
      controller?.destroy();
      if (window.__STOCKSEMBLY_OFFICE_TEST__ === bridgeRef.current) {
        delete window.__STOCKSEMBLY_OFFICE_TEST__;
      }
      bridgeRef.current = null;
    };
  }, []);

  const advance = (ticks: number): void => {
    bridgeRef.current?.advanceTicks(ticks);
  };

  return (
    <main className="office-calibration">
      <header className="office-calibration__header">
        <p>OFFICE V9 SNAPSHOT CALIBRATION</p>
        <h1>Immutable renderer inspection</h1>
        <span>
          {OFFICE_SCENE_MANIFEST.roster.length} manifest actors · fixed atlas
          scale · snapshot-owned choreography
        </span>
      </header>
      <section className="office-calibration__panel">
        <div
          className="office-calibration__toolbar"
          role="toolbar"
          aria-label="Simulation controls"
        >
          <button type="button" onClick={() => bridgeRef.current?.replay()}>
            Replay
          </button>
          <button type="button" onClick={() => advance(40)}>
            +40 ticks
          </button>
          <button type="button" onClick={() => advance(200)}>
            +200 ticks
          </button>
          <button type="button" onClick={() => bridgeRef.current?.skip()}>
            Skip
          </button>
          <button
            type="button"
            onClick={() => bridgeRef.current?.setCameraMode("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => bridgeRef.current?.setCameraMode("focus")}
          >
            Focus
          </button>
          <output data-testid="office-calibration-status">
            {status.error
              ? "Renderer failed"
              : status.ready
                ? `Tick ${status.tick} · ${status.beatId}`
                : "Loading renderer…"}
          </output>
        </div>
        <div
          ref={hostRef}
          className="office-game office-calibration__scene"
          data-calibration-ready={status.ready ? "true" : "false"}
          data-calibration-error={status.error ? "true" : undefined}
        />
      </section>
    </main>
  );
}
