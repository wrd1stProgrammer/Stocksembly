"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n";
import {
  createOfficeSnapshotRenderer,
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
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null);
  const selectedAgent = OFFICE_SCENE_MANIFEST.roster.find(
    (member) => member.id === selectedAgentId,
  );
  const selectedAgentEvent =
    selectedAgentId === null
      ? undefined
      : [...events].reverse().find((event) => event.agent === selectedAgentId);
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
    pendingRenderRef.current = {
      snapshot,
      previousSnapshot: renderPreviousSnapshot,
      interpolation: renderInterpolationAlpha,
      cameraMode,
      isPaused,
      liveBubbles: liveBubbleStates,
      ...(conversation === undefined ? {} : { conversation }),
    };
  }, [
    cameraMode,
    isPaused,
    renderInterpolationAlpha,
    renderPreviousSnapshot,
    snapshot,
    liveBubbleStates,
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
        if (pending.snapshot) {
          controller.renderSnapshot(pending.snapshot, {
            ...(pending.previousSnapshot
              ? { previousSnapshot: pending.previousSnapshot }
              : {}),
            interpolation: pending.interpolation,
            cameraMode: pending.cameraMode,
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
    if (snapshot) {
      controller.renderSnapshot(snapshot, {
        ...(renderPreviousSnapshot
          ? { previousSnapshot: renderPreviousSnapshot }
          : {}),
        interpolation: renderInterpolationAlpha,
        cameraMode,
        liveBubbles: liveBubbleStates,
        ...(conversation === undefined ? {} : { conversation }),
      });
    }
    controller.setPaused(isPaused);
  }, [
    cameraMode,
    isPaused,
    renderInterpolationAlpha,
    renderPreviousSnapshot,
    snapshot,
    liveBubbleStates,
    conversation,
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
      {selectedAgent === undefined ? null : (
        <OfficeAgentInfoPanel
          member={selectedAgent}
          locale={locale}
          {...(selectedAgentEvent === undefined
            ? {}
            : { latestEvent: selectedAgentEvent })}
          onClose={() => setSelectedAgentId(null)}
        />
      )}
    </div>
  );
}
