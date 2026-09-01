"use client";

import "../styles/landing.css";
import "../styles/office-game.css";
import { domAnimation, LazyMotion, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "../lib/i18n";
import { copy, researchLocale } from "../lib/i18n";
import {
  createLandingOfficeState,
  landingOfficeSnapshot,
  stepLandingOfficeState,
} from "../research/landingOfficeSimulation";
import type { OfficeGameController } from "../research/officeGame";
import { OFFICE_SCENE_MANIFEST } from "../research/officeSceneManifest";
import type { AgentId } from "../research/types";
import { OfficeAgentInfoPanel } from "./research/OfficeAgentInfoPanel";

const AMBIENT_STEP_MS = 420;
const DOT_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

function DotsRing() {
  return (
    <LazyMotion features={domAnimation} strict>
      <div className="landing-office-live__dots" aria-hidden="true">
        {DOT_ANGLES.map((angle, index) => (
          <m.div
            key={angle}
            className="landing-office-live__dot"
            style={{ rotate: angle }}
            animate={{ scale: [1, 0.5, 1], opacity: [1, 0.3, 1] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: index * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </LazyMotion>
  );
}

function observeVisibility(
  host: HTMLDivElement,
  onChange: (isVisible: boolean) => void,
): () => void {
  if (typeof IntersectionObserver === "undefined") {
    onChange(true);
    return () => undefined;
  }
  const observer = new IntersectionObserver(
    ([entry]) => onChange(entry?.isIntersecting ?? false),
    { rootMargin: "120px 0px" },
  );
  observer.observe(host);
  return () => observer.disconnect();
}

export function LandingOfficePreview({
  locale,
}: {
  readonly locale: AppLocale;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [rendererReady, setRendererReady] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null);
  const actorCount = OFFICE_SCENE_MANIFEST.roster.length;
  const selectedAgent = OFFICE_SCENE_MANIFEST.roster.find(
    (member) => member.id === selectedAgentId,
  );
  const labels = copy[locale].landing.office;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const abortController = new AbortController();
    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let controller: OfficeGameController | undefined;
    let stopObserving: () => void = () => undefined;
    let animationFrame: number | undefined;
    let lastStepAt = performance.now();
    let state = createLandingOfficeState();
    let previousSnapshot = landingOfficeSnapshot(state);
    let currentSnapshot = previousSnapshot;

    const stop = () => {
      if (animationFrame !== undefined) {
        cancelAnimationFrame(animationFrame);
        animationFrame = undefined;
      }
      controller?.setPaused(true);
    };

    const draw = (now: number) => {
      if (!controller || abortController.signal.aborted) return;
      let elapsed = now - lastStepAt;
      let advanced = 0;
      while (elapsed >= AMBIENT_STEP_MS && advanced < 3) {
        previousSnapshot = currentSnapshot;
        state = stepLandingOfficeState(state);
        currentSnapshot = landingOfficeSnapshot(state);
        lastStepAt += AMBIENT_STEP_MS;
        elapsed -= AMBIENT_STEP_MS;
        advanced += 1;
      }
      if (advanced === 3 && elapsed >= AMBIENT_STEP_MS) lastStepAt = now;
      controller.renderSnapshot(currentSnapshot, {
        previousSnapshot,
        interpolation: Math.min((now - lastStepAt) / AMBIENT_STEP_MS, 1),
        cameraMode: "overview",
      });
      animationFrame = requestAnimationFrame(draw);
    };

    const start = () => {
      if (!controller || animationFrame !== undefined || reducedMotion) return;
      lastStepAt = performance.now();
      controller.setPaused(false);
      animationFrame = requestAnimationFrame(draw);
    };
    setRendererFailed(false);
    setRendererReady(false);
    host.removeAttribute("data-office-ready");

    const initialize = async () => {
      // Pixi is intentionally loaded after the shell and loader have painted.
      // Keeping the canvas hidden until its first projected frame avoids the
      // transient, unprojected zoomed scene that was visible on first load.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      const { createOfficeSnapshotRenderer } = await import(
        "../research/officeGame"
      );
      return createOfficeSnapshotRenderer({
        host,
        locale: researchLocale(locale),
        reducedMotion,
        showActorUi: false,
        onActorSelect: setSelectedAgentId,
        signal: abortController.signal,
      });
    };

    // Nothing downloads until the office scrolls near the viewport: the Pixi
    // runtime, the 2.4MB floor image, and twelve sprite sheets all wait here.
    let initializing = false;
    const initializeOnce = () => {
      if (initializing) return;
      initializing = true;
      void initialize()
        .then((createdController) => {
          if (abortController.signal.aborted) {
            createdController.destroy();
            return;
          }
          controller = createdController;
          const mobileCamera =
            window.matchMedia?.("(max-width: 767px)").matches ?? false;
          createdController.setCameraControlMode(
            mobileCamera ? "free" : "overview",
          );
          controller.renderSnapshot(currentSnapshot, {
            cameraMode: "overview",
          });
          host.setAttribute("data-visible-bubble-count", "0");
          host.setAttribute("data-office-ready", "true");
          setRendererReady(true);
          if (reducedMotion) controller.setPaused(true);
          else start();
        })
        .catch(() => {
          if (!abortController.signal.aborted) {
            setRendererFailed(true);
            setRendererReady(false);
          }
        });
    };
    stopObserving = observeVisibility(host, (isVisible) => {
      if (!isVisible) {
        stop();
        return;
      }
      if (controller === undefined) initializeOnce();
      else start();
    });

    return () => {
      abortController.abort();
      stopObserving();
      stop();
      controller?.destroy();
    };
  }, [locale]);

  return (
    <section className="landing-office-live" aria-label={labels.label}>
      <header className="landing-office-live__intro">
        <h2>{labels.headline}</h2>
        <p>{labels.description}</p>
      </header>
      <div className="landing-office-live__status">
        <span>
          <i aria-hidden="true" />
          {labels.live}
        </span>
        <span>{labels.active(actorCount)}</span>
      </div>
      <div
        ref={hostRef}
        className="landing-office-live__world office-game office-game--world"
        data-render-error={rendererFailed ? "true" : undefined}
      >
        {!rendererReady && !rendererFailed ? (
          <div className="landing-office-live__loading" role="status">
            <DotsRing />
            <span>{labels.loading}</span>
          </div>
        ) : null}
        {rendererFailed ? (
          <p className="landing-office-live__error" role="alert">
            {labels.error}
          </p>
        ) : null}
      </div>
      {selectedAgent === undefined ? null : (
        <OfficeAgentInfoPanel
          member={selectedAgent}
          locale={researchLocale(locale)}
          onClose={() => setSelectedAgentId(null)}
        />
      )}
    </section>
  );
}
