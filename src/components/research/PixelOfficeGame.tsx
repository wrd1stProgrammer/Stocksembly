"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n";
import {
  createOfficeSnapshotRenderer,
  type OfficeCameraControlMode,
  type OfficeGameController,
} from "../../research/officeGame";
import {
  bubbleStateForSnapshot,
  isActorReadyForSpeech,
} from "../../research/officeGameBubbleState";
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
import { OfficeAgentInfoPanel } from "./OfficeAgentInfoPanel";

type Props = {
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
  readonly liveBubbles?: readonly {
    readonly actorId: AgentId;
    readonly message: string;
  }[];
  readonly conversation?: {
    readonly speakerId: AgentId;
    readonly participantIds: readonly AgentId[];
  };
};

const EMPTY_RESEARCH_EVENTS: readonly ResearchEvent[] = [];
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
  events = EMPTY_RESEARCH_EVENTS,
  locale,
  isPaused,
  activeAgentIds = [],
  snapshot,
  renderPreviousSnapshot,
  renderInterpolationAlpha = 1,
  cameraMode = "overview",
  cameraControlMode = "automatic",
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
  const speechEvents = useMemo(
    () => concurrentSpeechEvents(currentEvent, events),
    [currentEvent, events],
  );
  const conversationParticipantIds = useMemo(
    () =>
      currentEvent === undefined
        ? []
        : [
            ...new Set([
              currentEvent.agent,
              ...(currentEvent.participantIds ?? []),
            ]),
          ],
    [currentEvent],
  );
  const conversationReady = useMemo(
    () =>
      currentEvent !== undefined &&
      snapshot !== undefined &&
      conversationParticipantIds.every((actorId) => {
        const actor = snapshot.actors.find(
          (candidate) => candidate.id === actorId,
        );
        return actor !== undefined && isActorReadyForSpeech(actor);
      }),
    [conversationParticipantIds, currentEvent, snapshot],
  );
  const readySpeechEvents = useMemo(
    () => (conversationReady ? speechEvents : []),
    [conversationReady, speechEvents],
  );
  const conversation = useMemo(
    () =>
      currentEvent === undefined || !conversationReady
        ? undefined
        : {
            speakerId: currentEvent.agent,
            participantIds: conversationParticipantIds,
          },
    [conversationParticipantIds, conversationReady, currentEvent],
  );
  const pendingRenderRef = useRef<PendingRender>({
    snapshot,
    previousSnapshot: renderPreviousSnapshot,
    interpolation: renderInterpolationAlpha,
    cameraMode,
    cameraControlMode,
    isPaused,
    liveBubbles: readySpeechEvents.map((event) => ({
      actorId: event.agent,
      message:
        event.id === currentEvent?.id
          ? (liveBubbleSegments[0] ??
            activityCopy(event.summary[locale], locale).headline)
          : activityCopy(event.summary[locale], locale).headline,
    })),
    ...(conversation === undefined ? {} : { conversation }),
  });
  const [rendererFailed, setRendererFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mobileCameraActive, setMobileCameraActive] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null);
  const selectedAgent = OFFICE_SCENE_MANIFEST.roster.find(
    (member) => member.id === selectedAgentId,
  );
  const bubbleSequenceKey = `${currentEvent?.id ?? "idle"}:${locale}`;
  const [bubblePlayback, setBubblePlayback] = useState({
    key: bubbleSequenceKey,
    index: 0,
  });
  const bubbleSegmentIndex =
    bubblePlayback.key === bubbleSequenceKey ? bubblePlayback.index : 0;
  const mode = sceneMode(snapshot, phase);
  const effectiveCameraMode = mobileCameraActive
    ? cameraControlMode === "overview"
      ? "overview"
      : "focus"
    : cameraMode;
  const mobileCameraActorIds = useMemo(() => {
    if (!mobileCameraActive || cameraControlMode !== "automatic")
      return undefined;
    const available = new Set(snapshot?.actors.map((actor) => actor.id) ?? []);
    const preferred =
      currentEvent === undefined
        ? activeAgentIds
        : [
            currentEvent.agent,
            ...(conversationReady ? conversationParticipantIds : []),
          ];
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
    conversationParticipantIds,
    conversationReady,
    cameraControlMode,
    currentEvent,
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
  const liveBubbleStates = useMemo(
    () =>
      readySpeechEvents.map((event) => ({
        actorId: event.agent,
        message:
          event.id === currentEvent?.id &&
          liveBubbleSegments.length > 0 &&
          bubbleSegmentIndex < liveBubbleSegments.length
            ? (liveBubbleSegments[bubbleSegmentIndex] ?? "")
            : activityCopy(event.summary[locale], locale).headline,
      })),
    [
      bubbleSegmentIndex,
      currentEvent?.id,
      liveBubbleSegments,
      locale,
      readySpeechEvents,
    ],
  );
  const visibleBubbleCount =
    currentEvent !== undefined
      ? liveBubbleStates.length
      : (snapshot?.actors.filter(
          (actor) => bubbleStateForSnapshot(actor, snapshot, locale).visible,
        ).length ?? 0);
  useEffect(() => {
    if (!conversationReady || bubbleSegmentIndex >= liveBubbleSegments.length)
      return;
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
  }, [
    bubbleSegmentIndex,
    bubbleSequenceKey,
    conversationReady,
    liveBubbleSegments,
  ]);

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
      ...(mobileCameraActorIds === undefined
        ? {}
        : { cameraActorIds: mobileCameraActorIds }),
      isPaused,
      liveBubbles: liveBubbleStates,
      ...(conversation === undefined ? {} : { conversation }),
    };
  }, [
    effectiveCameraMode,
    cameraControlMode,
    isPaused,
    renderInterpolationAlpha,
    renderPreviousSnapshot,
    snapshot,
    liveBubbleStates,
    mobileCameraActorIds,
    conversation,
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
      onActorSelect: setSelectedAgentId,
      signal: abortController.signal,
    })
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
            ...(pending.liveBubbles === undefined
              ? {}
              : { liveBubbles: pending.liveBubbles }),
            ...(pending.conversation === undefined
              ? {}
              : { conversation: pending.conversation }),
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
    controller.setCameraControlMode(cameraControlMode);
    if (snapshot) {
      controller.renderSnapshot(snapshot, {
        ...(renderPreviousSnapshot
          ? { previousSnapshot: renderPreviousSnapshot }
          : {}),
        interpolation: renderInterpolationAlpha,
        cameraMode: effectiveCameraMode,
        ...(mobileCameraActorIds === undefined
          ? {}
          : { cameraActorIds: mobileCameraActorIds }),
        liveBubbles: liveBubbleStates,
        ...(conversation === undefined ? {} : { conversation }),
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
    liveBubbleStates,
    mobileCameraActorIds,
    conversation,
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
