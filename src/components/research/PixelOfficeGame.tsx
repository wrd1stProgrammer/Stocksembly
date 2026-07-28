"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n";
import {
  createOfficeSnapshotRenderer,
  type OfficeGameController,
} from "../../research/officeGame";
import { bubbleStateForSnapshot } from "../../research/officeGameBubbleState";
import { OFFICE_SCENE_MANIFEST } from "../../research/officeSceneManifest";
import type { OfficeSimulationSnapshot } from "../../research/officeSimulation";
import {
  activityCopy,
  speechBubbleSegments,
} from "../../research/researchPresentation";
import type {
  AgentId,
  ResearchEvent,
  ResearchPhase,
} from "../../research/types";

type Props = {
  readonly phase?: ResearchPhase;
  readonly currentEvent?: ResearchEvent;
  readonly locale: Locale;
  readonly isPaused: boolean;
  readonly activeAgentIds?: readonly AgentId[];
  readonly snapshot?: OfficeSimulationSnapshot;
  readonly renderPreviousSnapshot?: OfficeSimulationSnapshot;
  readonly renderInterpolationAlpha?: number;
  readonly cameraMode?: "overview" | "focus";
};

type SceneMode =
  | "work"
  | "team-talk"
  | "visit"
  | "returning"
  | "gathering"
  | "forum";

type PendingRender = {
  readonly snapshot: OfficeSimulationSnapshot | undefined;
  readonly previousSnapshot: OfficeSimulationSnapshot | undefined;
  readonly interpolation: number;
  readonly cameraMode: "overview" | "focus";
  readonly isPaused: boolean;
  readonly liveBubble?: {
    readonly actorId: AgentId;
    readonly message: string;
  };
};

function sceneMode(
  snapshot: OfficeSimulationSnapshot | undefined,
  phase: ResearchPhase | undefined,
): SceneMode {
  if (!snapshot) {
    if (phase === "gathering") return "gathering";
    if (phase === "committee" || phase === "complete") return "forum";
    return "work";
  }
  switch (snapshot.beatId) {
    case "department-talk":
      return "team-talk";
    case "visit-wave-a":
    case "visit-wave-b":
      return "visit";
    case "return-a":
    case "return-b":
      return "returning";
    case "representative-gathering":
      return "gathering";
    case "forum":
    case "complete":
      return "forum";
    case "briefing":
    case "parallel-work":
      return "work";
  }
}

function semanticStatus(
  mode: SceneMode,
  locale: Locale,
  forumNames: string,
): string {
  if (mode === "gathering") {
    return locale === "ko"
      ? `중앙 회의로 이동 중: ${forumNames}`
      : `Moving to the central review: ${forumNames}`;
  }
  if (mode === "forum") {
    return locale === "ko"
      ? `중앙 회의에서 검토 중: ${forumNames}`
      : `Reviewing in the central forum: ${forumNames}`;
  }
  return locale === "ko"
    ? "각 부서가 연결된 리서치 룸에서 병렬 조사 중입니다."
    : "Each department is researching in parallel across the connected research rooms.";
}

export function PixelOfficeGame({
  phase,
  currentEvent,
  locale,
  isPaused,
  activeAgentIds = [],
  snapshot,
  renderPreviousSnapshot,
  renderInterpolationAlpha = 1,
  cameraMode = "overview",
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<OfficeGameController | null>(null);
  const liveBubbleSegments = useMemo(
    () =>
      currentEvent === undefined
        ? []
        : speechBubbleSegments(currentEvent.summary[locale], locale),
    [currentEvent, locale],
  );
  const pendingRenderRef = useRef<PendingRender>({
    snapshot,
    previousSnapshot: renderPreviousSnapshot,
    interpolation: renderInterpolationAlpha,
    cameraMode,
    isPaused,
    ...(currentEvent === undefined
      ? {}
      : {
          liveBubble: {
            actorId: currentEvent.agent,
            message:
              liveBubbleSegments[0] ??
              activityCopy(currentEvent.summary[locale], locale).headline,
          },
        }),
  });
  const [rendererFailed, setRendererFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const bubbleSequenceKey = `${currentEvent?.id ?? "idle"}:${locale}`;
  const [bubblePlayback, setBubblePlayback] = useState({
    key: bubbleSequenceKey,
    index: 0,
  });
  const bubbleSegmentIndex =
    bubblePlayback.key === bubbleSequenceKey ? bubblePlayback.index : 0;
  const mode = sceneMode(snapshot, phase);
  const forumNames = useMemo(
    () =>
      OFFICE_SCENE_MANIFEST.roster
        .filter((member) => member.finalLocation === "forum")
        .map((member) => member.name[locale])
        .join(", "),
    [locale],
  );
  const movingActorCount =
    snapshot?.actors.filter(
      (actor) => actor.action === "walk" || actor.action === "return",
    ).length ?? 0;
  const workingActorCount =
    snapshot?.actors.filter((actor) => actor.action === "seated-work").length ??
    0;
  const visibleBubbleCount =
    snapshot?.actors.filter(
      (actor) => bubbleStateForSnapshot(actor, snapshot, locale).visible,
    ).length ?? 0;
  const liveBubbleState =
    liveBubbleSegments.length === 0 ||
    currentEvent === undefined ||
    bubbleSegmentIndex >= liveBubbleSegments.length
      ? undefined
      : {
          actorId: currentEvent.agent,
          message: liveBubbleSegments[bubbleSegmentIndex] ?? "",
        };

  useEffect(() => {
    if (bubbleSegmentIndex >= liveBubbleSegments.length) return;
    const timer = window.setTimeout(
      () =>
        setBubblePlayback((current) => ({
          key: bubbleSequenceKey,
          index: Math.min(
            (current.key === bubbleSequenceKey ? current.index : 0) + 1,
            liveBubbleSegments.length,
          ),
        })),
      2_800,
    );
    return () => window.clearTimeout(timer);
  }, [bubbleSegmentIndex, bubbleSequenceKey, liveBubbleSegments]);

  useEffect(() => {
    pendingRenderRef.current = {
      snapshot,
      previousSnapshot: renderPreviousSnapshot,
      interpolation: renderInterpolationAlpha,
      cameraMode,
      isPaused,
      ...(liveBubbleState === undefined ? {} : { liveBubble: liveBubbleState }),
    };
  }, [
    cameraMode,
    isPaused,
    renderInterpolationAlpha,
    renderPreviousSnapshot,
    snapshot,
    liveBubbleState,
  ]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const abortController = new AbortController();
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setReducedMotion(prefersReducedMotion);
    setRendererFailed(false);

    void createOfficeSnapshotRenderer({
      host,
      locale,
      reducedMotion: prefersReducedMotion,
      showActorBubbles: true,
      signal: abortController.signal,
    })
      .then((controller) => {
        if (abortController.signal.aborted) {
          controller.destroy();
          return;
        }
        controllerRef.current = controller;
        const pending = pendingRenderRef.current;
        if (pending.snapshot) {
          controller.renderSnapshot(pending.snapshot, {
            ...(pending.previousSnapshot
              ? { previousSnapshot: pending.previousSnapshot }
              : {}),
            interpolation: pending.interpolation,
            cameraMode: pending.cameraMode,
            ...(pending.liveBubble === undefined
              ? {}
              : { liveBubble: pending.liveBubble }),
          });
        }
        controller.setPaused(pending.isPaused);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setRendererFailed(true);
      });

    return () => {
      abortController.abort();
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [locale]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (snapshot) {
      controller.renderSnapshot(snapshot, {
        ...(renderPreviousSnapshot
          ? { previousSnapshot: renderPreviousSnapshot }
          : {}),
        interpolation: renderInterpolationAlpha,
        cameraMode,
        ...(liveBubbleState === undefined
          ? {}
          : { liveBubble: liveBubbleState }),
      });
    }
    controller.setPaused(isPaused);
  }, [
    cameraMode,
    isPaused,
    renderInterpolationAlpha,
    renderPreviousSnapshot,
    snapshot,
    liveBubbleState,
  ]);

  return (
    <div
      ref={hostRef}
      className={`office-game office-game--world${isPaused ? " is-paused" : ""}`}
      data-camera-mode={cameraMode}
      data-scene-phase={snapshot?.beatId ?? "briefing"}
      data-snapshot-tick={snapshot?.tick}
      data-scene-mode={mode}
      data-active-agent-count={activeAgentIds.length}
      data-moving-actor-count={movingActorCount}
      data-working-actor-count={workingActorCount}
      data-visible-bubble-count={visibleBubbleCount}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-complete={snapshot?.beatId === "complete" ? "true" : "false"}
      data-render-error={rendererFailed ? "true" : undefined}
    >
      {rendererFailed ? (
        <p className="office-game__error" role="alert">
          {locale === "ko"
            ? "리서치 룸을 불러오지 못했습니다."
            : "The research room could not be loaded."}
        </p>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {semanticStatus(mode, locale, forumNames)}
      </span>
    </div>
  );
}
