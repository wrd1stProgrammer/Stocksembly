"use client";

import "../../styles/office-game.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n";
import {
  type OfficeDialogue,
  type OfficePresentation,
  officeDialogue,
} from "../../research/officeDialogue";
import type {
  OfficeCameraControlMode,
  OfficeGameController,
} from "../../research/officeGame";
import { prefersReducedMotion } from "../../research/officeReducedMotion";
import { OFFICE_SCENE_MANIFEST } from "../../research/officeSceneManifest";
import type { OfficeSimulationSnapshot } from "../../research/officeSimulation";
import { speechBubbleSegments } from "../../research/researchPresentation";
import type {
  AgentId,
  ResearchEvent,
  ResearchPhase,
} from "../../research/types";
import { OfficeAgentInfoPanel } from "./OfficeAgentInfoPanel";

type Props = {
  readonly presentation?: OfficePresentation;
  readonly phase?: ResearchPhase;
  readonly currentEvent?: ResearchEvent;
  readonly events?: readonly ResearchEvent[];
  readonly locale: Locale;
  readonly isPaused: boolean;
  readonly activeAgentIds?: readonly AgentId[];
  readonly snapshot?: OfficeSimulationSnapshot;
  readonly renderPreviousSnapshot?: OfficeSimulationSnapshot;
  readonly renderInterpolationAlpha?: number;
  readonly cameraMode?: "overview" | "focus";
  readonly cameraControlMode?: OfficeCameraControlMode;
  readonly onReady?: () => void;
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
  readonly cameraControlMode: OfficeCameraControlMode;
  readonly cameraActorIds?: readonly AgentId[];
  readonly isPaused: boolean;
  readonly dialogue?: OfficeDialogue;
};

const MOBILE_CAMERA_QUERY = "(max-width: 767px)";

export function concurrentSpeechEvents(
  currentEvent: ResearchEvent | undefined,
  events: readonly ResearchEvent[],
): readonly ResearchEvent[] {
  if (currentEvent === undefined) return [];
  const currentIndex = events.findIndex(
    (event) => event.id === currentEvent.id,
  );
  const visibleEvents =
    currentIndex < 0
      ? [...events, currentEvent]
      : events.slice(0, currentIndex + 1);
  const matching = visibleEvents.filter(
    (event) =>
      event.phase === currentEvent.phase &&
      event.workflowKind === currentEvent.workflowKind,
  );
  const uniqueSpeakers = new Set<AgentId>();
  return [...matching]
    .reverse()
    .filter((event) => {
      if (uniqueSpeakers.has(event.agent)) return false;
      uniqueSpeakers.add(event.agent);
      return true;
    })
    .slice(0, 3)
    .reverse();
}

export function speechBubbleMessage(
  event: ResearchEvent,
  locale: Locale,
  segmentIndex: number,
): string {
  const segments = speechBubbleSegments(event.summary[locale], locale);
  return segments[Math.max(0, segmentIndex)] ?? "";
}

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
  presentation,
  phase,
  currentEvent,
  locale,
  isPaused,
  activeAgentIds = [],
  snapshot,
  renderPreviousSnapshot,
  renderInterpolationAlpha = 1,
  cameraMode = "overview",
  cameraControlMode = "automatic",
  onReady,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<OfficeGameController | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onDialogueChangeRef = useRef(presentation?.onChange);
  onDialogueChangeRef.current = presentation?.onChange;
  const dialogue = useMemo(() => {
    const event =
      presentation === undefined ? currentEvent : presentation.event;
    if (!event || event.id === "office-waiting") return undefined;
    const request = officeDialogue(event, locale);
    return presentation?.active === false
      ? { ...request, segments: [] }
      : request;
  }, [currentEvent, locale, presentation]);
  const conversationParticipantIds = dialogue?.participantIds ?? [];
  const pendingRenderRef = useRef<PendingRender>({
    snapshot,
    previousSnapshot: renderPreviousSnapshot,
    interpolation: renderInterpolationAlpha,
    cameraMode,
    cameraControlMode,
    isPaused,
    ...(dialogue ? { dialogue } : {}),
  });
  const [rendererFailed, setRendererFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mobileCameraActive, setMobileCameraActive] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null);
  const selectedAgent = OFFICE_SCENE_MANIFEST.roster.find(
    (member) => member.id === selectedAgentId,
  );
  const mode = sceneMode(snapshot, phase);
  const effectiveCameraMode =
    cameraControlMode === "overview"
      ? "overview"
      : mobileCameraActive || cameraMode === "focus"
        ? "focus"
        : cameraMode;
  const cameraActorIds = useMemo(() => {
    if (cameraControlMode !== "automatic") return undefined;
    if (!mobileCameraActive && cameraMode !== "focus") return undefined;
    const available = new Set(snapshot?.actors.map((actor) => actor.id) ?? []);
    if (!mobileCameraActive && cameraMode === "focus") {
      const focusedTeamIds =
        snapshot?.cameraTarget.kind === "actors"
          ? snapshot.cameraTarget.actorIds
          : (snapshot?.actors.map((actor) => actor.id) ?? []);
      return focusedTeamIds.filter((actorId) => available.has(actorId));
    }
    const preferred =
      dialogue === undefined
        ? activeAgentIds
        : [dialogue.speakerId, ...conversationParticipantIds];
    const actorIds = [...new Set(preferred)].filter((actorId) =>
      available.has(actorId),
    );
    if (actorIds.length > 0) return actorIds;
    if (snapshot?.cameraTarget.kind === "actors")
      return snapshot.cameraTarget.actorIds;
    return snapshot?.actors[0] === undefined
      ? undefined
      : [snapshot.actors[0].id];
  }, [
    activeAgentIds,
    cameraMode,
    conversationParticipantIds,
    cameraControlMode,
    dialogue,
    mobileCameraActive,
    snapshot,
  ]);
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
  useEffect(() => {
    const media = window.matchMedia(MOBILE_CAMERA_QUERY);
    const update = () => setMobileCameraActive(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    pendingRenderRef.current = {
      snapshot,
      previousSnapshot: renderPreviousSnapshot,
      interpolation: renderInterpolationAlpha,
      cameraMode: effectiveCameraMode,
      cameraControlMode,
      ...(cameraActorIds === undefined ? {} : { cameraActorIds }),
      isPaused,
      ...(dialogue ? { dialogue } : {}),
    };
  }, [
    effectiveCameraMode,
    cameraControlMode,
    isPaused,
    renderInterpolationAlpha,
    renderPreviousSnapshot,
    snapshot,
    dialogue,
    cameraActorIds,
  ]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const abortController = new AbortController();
    let readyFrame = 0;
    const reducedMotionPreferred = prefersReducedMotion();
    setReducedMotion(reducedMotionPreferred);
    setRendererFailed(false);

    void import("../../research/officeGame")
      .then(({ createOfficeSnapshotRenderer }) =>
        createOfficeSnapshotRenderer({
          host,
          locale,
          reducedMotion: reducedMotionPreferred,
          showActorBubbles: true,
          onActorSelect: setSelectedAgentId,
          onDialogueChange: (change) => onDialogueChangeRef.current?.(change),
          signal: abortController.signal,
        }),
      )
      .then((controller) => {
        if (abortController.signal.aborted) {
          controller.destroy();
          return;
        }
        controllerRef.current = controller;
        const pending = pendingRenderRef.current;
        controller.setCameraControlMode(pending.cameraControlMode);
        if (pending.snapshot) {
          controller.renderSnapshot(pending.snapshot, {
            ...(pending.previousSnapshot
              ? { previousSnapshot: pending.previousSnapshot }
              : {}),
            interpolation: pending.interpolation,
            cameraMode: pending.cameraMode,
            ...(pending.cameraActorIds === undefined
              ? {}
              : { cameraActorIds: pending.cameraActorIds }),
            liveBubbles: [],
            ...(pending.dialogue ? { dialogue: pending.dialogue } : {}),
          });
        }
        controller.setPaused(pending.isPaused);
        const notifyWhenPainted = (): void => {
          if (abortController.signal.aborted) return;
          if (
            document.visibilityState === "visible" &&
            host.getClientRects().length > 0
          ) {
            onReadyRef.current?.();
            return;
          }
          readyFrame = window.requestAnimationFrame(notifyWhenPainted);
        };
        // One frame commits the Pixi canvas; the second confirms that the
        // research screen itself has reached a visible browser paint.
        readyFrame = window.requestAnimationFrame(() => {
          readyFrame = window.requestAnimationFrame(notifyWhenPainted);
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setRendererFailed(true);
      });

    return () => {
      abortController.abort();
      window.cancelAnimationFrame(readyFrame);
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [locale]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.setCameraControlMode(cameraControlMode);
    if (snapshot) {
      controller.renderSnapshot(snapshot, {
        ...(renderPreviousSnapshot
          ? { previousSnapshot: renderPreviousSnapshot }
          : {}),
        interpolation: renderInterpolationAlpha,
        cameraMode: effectiveCameraMode,
        ...(cameraActorIds === undefined ? {} : { cameraActorIds }),
        liveBubbles: [],
        ...(dialogue ? { dialogue } : {}),
      });
    }
    controller.setPaused(isPaused);
  }, [
    effectiveCameraMode,
    cameraControlMode,
    isPaused,
    renderInterpolationAlpha,
    renderPreviousSnapshot,
    snapshot,
    dialogue,
    cameraActorIds,
  ]);

  return (
    <div
      ref={hostRef}
      className={`office-game office-game--world${isPaused ? " is-paused" : ""}`}
      data-camera-mode={effectiveCameraMode}
      data-camera-control-mode={cameraControlMode}
      data-mobile-camera={mobileCameraActive ? "active" : "inactive"}
      data-scene-phase={snapshot?.beatId ?? "briefing"}
      data-snapshot-tick={snapshot?.tick}
      data-scene-mode={mode}
      data-active-agent-count={activeAgentIds.length}
      data-moving-actor-count={movingActorCount}
      data-working-actor-count={workingActorCount}
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
      {selectedAgent === undefined ? null : (
        <OfficeAgentInfoPanel
          member={selectedAgent}
          locale={locale}
          onClose={() => setSelectedAgentId(null)}
        />
      )}
    </div>
  );
}
