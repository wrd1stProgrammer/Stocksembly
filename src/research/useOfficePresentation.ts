"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OfficeDialogueChange } from "./officeDialogue";
import type { ResearchEvent } from "./types";

export const OFFICE_WAITING_EVENT: ResearchEvent = {
  id: "office-waiting",
  agent: "chair",
  phase: "briefing",
  progress: 0,
  tick: 0,
  summary: {
    ko: "리서치 룸을 준비하고 있습니다.",
    en: "Preparing the research room.",
  },
  detail: { ko: "", en: "" },
};

type Playback = {
  sessionId: string;
  finished: readonly string[];
  syncRevision: number;
  snappedThrough?: string;
};
type Options = {
  readonly syncRevision?: number;
  readonly terminal?: boolean;
  readonly restore?: boolean;
};

export function useOfficePresentation(
  events: readonly ResearchEvent[],
  sessionId: string,
  bypass = false,
  options: Options = {},
) {
  const revision = options.syncRevision ?? 0;
  const initial = (): Playback => ({
    sessionId,
    finished: options.restore ? events.map((e) => e.id) : [],
    syncRevision: revision,
    ...(options.restore && events.at(-1)
      ? { snappedThrough: events.at(-1)!.id }
      : {}),
  });
  const [record, setRecord] = useState<Playback>(initial);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const update = () => setHidden(document.visibilityState === "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  let state = record.sessionId === sessionId ? record : initial();
  const latest = events.at(-1);
  const pendingEvents = events.filter(
    (event) => !state.finished.includes(event.id),
  );
  const first = pendingEvents[0];
  const fullCatchUp =
    bypass || options.terminal || hidden || revision !== state.syncRevision;
  // A later server phase supersedes the old performance. Keep visible live
  // dialogue, but never make the user watch an unbounded historical backlog.
  const phaseCatchUp =
    first &&
    latest &&
    ((first.phase !== latest.phase && (latest.tick ?? 0) > (first.tick ?? 0)) ||
      pendingEvents.length > 3);
  if (
    (fullCatchUp &&
      (pendingEvents.length > 0 || revision !== state.syncRevision)) ||
    (!fullCatchUp && phaseCatchUp && first.id !== latest.id)
  ) {
    state = {
      sessionId,
      syncRevision: revision,
      finished: (fullCatchUp ? events : events.slice(0, -1)).map(
        (event) => event.id,
      ),
      ...(latest ? { snappedThrough: latest.id } : {}),
    };
  }
  if (state !== record) setRecord(state);
  const pending = fullCatchUp
    ? undefined
    : events.find((event) => !state.finished.includes(event.id));
  const sceneEvent = pending ?? latest;
  const snapToProgress =
    bypass ||
    options.terminal === true ||
    (state.snappedThrough !== undefined &&
      (pending === undefined || pending.id === state.snappedThrough));
  const onChange = useCallback(
    (change: OfficeDialogueChange) => {
      if (change.id !== pending?.id || change.status !== "finished") return;
      setRecord((previous) =>
        previous.sessionId !== sessionId ||
        previous.finished.includes(change.id)
          ? previous
          : { ...previous, finished: [...previous.finished, change.id] },
      );
    },
    [pending?.id, sessionId],
  );
  const presentation = useMemo(
    () => ({
      event: sceneEvent,
      active: pending !== undefined,
      snapToProgress,
      onChange,
    }),
    [sceneEvent, pending, snapToProgress, onChange],
  );
  return {
    // The transcript is a durable server record, not an animation queue.
    events,
    current: sceneEvent ?? OFFICE_WAITING_EVENT,
    presentation,
    tick: sceneEvent?.tick ?? 0,
    snapToProgress,
    drained: pending === undefined,
  };
}
