"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "../lib/i18n";
import {
  createOfficeSnapshotRenderer,
  type OfficeGameController,
} from "../research/officeGame";
import {
  createLandingOfficeState,
  landingOfficeSnapshot,
  stepLandingOfficeState,
} from "../research/landingOfficeSimulation";
import { OFFICE_SCENE_MANIFEST } from "../research/officeSceneManifest";

const AMBIENT_STEP_MS = 420;

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

export function LandingOfficePreview({ locale }: { readonly locale: Locale }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [rendererFailed, setRendererFailed] = useState(false);
  const actorCount = OFFICE_SCENE_MANIFEST.roster.length;

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
    void createOfficeSnapshotRenderer({
      host,
      locale,
      reducedMotion,
      showActorUi: false,
      signal: abortController.signal,
    })
      .then((createdController) => {
        if (abortController.signal.aborted) {
          createdController.destroy();
          return;
        }
        controller = createdController;
        controller.renderSnapshot(currentSnapshot, { cameraMode: "overview" });
        host.setAttribute("data-visible-bubble-count", "0");
        if (reducedMotion) {
          controller.setPaused(true);
          return;
        }
        stopObserving = observeVisibility(host, (isVisible) => {
          if (isVisible) start();
          else stop();
        });
      })
      .catch(() => {
        if (!abortController.signal.aborted) setRendererFailed(true);
      });

    return () => {
      abortController.abort();
      stopObserving();
      stop();
      controller?.destroy();
    };
  }, [locale]);

  return (
    <section
      className="landing-office-live"
      aria-label={
        locale === "ko"
          ? "AI 에이전트 리서치 오피스"
          : "AI agent research office"
      }
    >
      <div className="landing-office-live__status">
        <span>
          <i aria-hidden="true" />
          {locale === "ko" ? "실시간 리서치 오피스" : "Live research office"}
        </span>
        <span>
          {locale === "ko"
            ? `${actorCount}개 에이전트 활동 중`
            : `${actorCount} agents active`}
        </span>
      </div>
      <div
        ref={hostRef}
        className="landing-office-live__world office-game office-game--world"
        data-render-error={rendererFailed ? "true" : undefined}
      >
        {rendererFailed ? (
          <p className="landing-office-live__error" role="alert">
            {locale === "ko"
              ? "리서치 오피스를 불러오지 못했습니다."
              : "The research office could not be loaded."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
