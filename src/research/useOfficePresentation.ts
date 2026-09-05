"use client";

import { useCallback, useMemo, useState } from "react";
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

export function useOfficePresentation(
  events: readonly ResearchEvent[],
  sessionId: string,
  bypass = false,
) {
  const [record, setRecord] = useState<{
    sessionId: string;
    started: readonly string[];
    finished: readonly string[];
  }>({ sessionId, started: [], finished: [] });
  const state =
    record.sessionId === sessionId
      ? record
      : { sessionId, started: [], finished: [] };
  const pending = bypass
    ? undefined
    : events.find((event) => !state.finished.includes(event.id));
  const visible = useMemo(
    () =>
      bypass
        ? events
        : events.filter((event) => state.started.includes(event.id)),
    [bypass, events, state.started],
  );
  const sceneEvent =
    pending ??
    [...events].reverse().find((event) => state.finished.includes(event.id));
  const onChange = useCallback(
    (change: OfficeDialogueChange) => {
      if (change.id !== pending?.id) return;
      setRecord((previous) => {
        const current =
          previous.sessionId === sessionId
            ? previous
            : { sessionId, started: [], finished: [] };
        const key = change.status === "started" ? "started" : "finished";
        return current[key].includes(change.id)
          ? current
          : { ...current, [key]: [...current[key], change.id] };
      });
    },
    [pending?.id, sessionId],
  );
  return {
    events: visible,
    current: visible.at(-1) ?? OFFICE_WAITING_EVENT,
    presentation: useMemo(
      () => ({ event: sceneEvent, active: pending !== undefined, onChange }),
      [sceneEvent, pending, onChange],
    ),
    tick: (bypass ? events.at(-1)?.tick : sceneEvent?.tick) ?? 0,
    drained: pending === undefined,
  };
}
