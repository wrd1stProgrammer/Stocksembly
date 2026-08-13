"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WORKFLOW_PUBLIC_EVENT_KINDS } from "../workflow/publicEventsContracts";
import { type ResearchClient, ResearchRequestError } from "./api";
import {
  nativeResearchEventSource,
  type ResearchEventSource,
  reloadAfterReauthentication,
  scheduleResearchFallback,
} from "./eventSource";
import { appendPublicEvent, parseStreamEvent, stateForRun } from "./projection";
import type {
  ChildRun,
  PublicQuestion,
  PublicRunDetail,
  RecoveredRun,
} from "./schemas";

export type { ResearchEventSource } from "./eventSource";

export type ResearchRunViewState =
  | "loading"
  | "live"
  | "connection-interrupted"
  | "reauthenticating"
  | "degraded"
  | "cancelling"
  | "cancelled"
  | "incomplete"
  | "failed"
  | "published";

type Options = {
  readonly client: ResearchClient;
  readonly createEventSource?: (url: string) => ResearchEventSource;
  readonly schedule?: (callback: () => void, delay: number) => () => void;
  readonly reauthenticate?: () => void;
  readonly createId?: () => string;
};

export type ResearchRunProjection = {
  readonly snapshot: PublicRunDetail;
  readonly state: ResearchRunViewState;
  readonly lastEventSeq: number;
  readonly cancel: () => Promise<void>;
  readonly retry: () => Promise<RecoveredRun>;
  readonly followUp: (question?: string) => Promise<ChildRun>;
  readonly askQuestion: (question: string) => Promise<PublicQuestion>;
  readonly resync: () => Promise<void>;
};

export class ResearchCommandUnavailableError extends Error {
  readonly name = "ResearchCommandUnavailableError";
}

export function useResearchRun(
  initial: PublicRunDetail,
  options: Options,
): ResearchRunProjection {
  const [snapshot, setSnapshot] = useState(initial);
  const [state, setState] = useState<ResearchRunViewState>("loading");
  const snapshotRef = useRef(initial);
  const sourceRef = useRef<ResearchEventSource | undefined>(undefined);
  const removeListenersRef = useRef<(() => void) | undefined>(undefined);
  const cancelTimerRef = useRef<(() => void) | undefined>(undefined);
  const failuresRef = useRef(0);
  const mountedRef = useRef(false);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const replaceSnapshot = useCallback((next: PublicRunDetail) => {
    snapshotRef.current = next;
    setSnapshot(next);
    setState(stateForRun(next.run.status));
  }, []);

  const openStream = useCallback(
    (after: number) => {
      removeListenersRef.current?.();
      sourceRef.current?.close();
      const currentOptions = optionsRef.current;
      const source = (
        currentOptions.createEventSource ?? nativeResearchEventSource
      )(
        `/api/research/runs/${snapshotRef.current.run.runId}/events?after=${after}`,
      );
      sourceRef.current = source;
      source.onopen = () => {
        failuresRef.current = 0;
        cancelTimerRef.current?.();
        cancelTimerRef.current = undefined;
        setState(stateForRun(snapshotRef.current.run.status));
      };
      source.onerror = () => {
        setState("connection-interrupted");
        failuresRef.current += 1;
        const delay = Math.min(30_000, 1_000 * 2 ** (failuresRef.current - 1));
        cancelTimerRef.current?.();
        cancelTimerRef.current = (
          currentOptions.schedule ?? scheduleResearchFallback
        )(() => void resyncRef.current(), delay);
      };
      const removers = WORKFLOW_PUBLIC_EVENT_KINDS.map((kind) =>
        source.listen(kind, (message) => {
          const parsed = parseStreamEvent(message);
          if (parsed.kind === "invalid") {
            setState("degraded");
            source.close();
            void resyncRef.current();
            return;
          }
          const cursor = snapshotRef.current.run.lastEventSeq;
          if (parsed.event.sequence <= cursor) return;
          if (parsed.event.sequence !== cursor + 1) {
            setState("degraded");
            source.close();
            void resyncRef.current();
            return;
          }
          const next = appendPublicEvent(snapshotRef.current, parsed.event);
          replaceSnapshot(next);
          if (stateForRun(next.run.status) !== "live") source.close();
        }),
      );
      removeListenersRef.current = () => {
        for (const remove of removers) remove();
      };
    },
    [replaceSnapshot],
  );

  const refreshSnapshot = useCallback(
    async (reopenStream: boolean): Promise<void> => {
      try {
        const next = await optionsRef.current.client.getRun(
          snapshotRef.current.run.runId,
        );
        if (!mountedRef.current) return;
        replaceSnapshot(next);
        if (stateForRun(next.run.status) !== "live") {
          sourceRef.current?.close();
        } else if (reopenStream) {
          openStream(next.run.lastEventSeq);
        }
      } catch (error) {
        if (!mountedRef.current) return;
        if (error instanceof ResearchRequestError && error.status === 401) {
          setState("reauthenticating");
          try {
            await optionsRef.current.client.bootstrapSession();
            (
              optionsRef.current.reauthenticate ?? reloadAfterReauthentication
            )();
          } catch (bootstrapError) {
            if (bootstrapError instanceof Error) {
              setState("degraded");
              return;
            }
            throw bootstrapError;
          }
          return;
        }
        setState("degraded");
      }
    },
    [openStream, replaceSnapshot],
  );
  const resync = useCallback(
    async (): Promise<void> => await refreshSnapshot(true),
    [refreshSnapshot],
  );
  const resyncRef = useRef(resync);

  useEffect(() => {
    resyncRef.current = resync;
  }, [resync]);

  useEffect(() => {
    mountedRef.current = true;
    const initialState = stateForRun(initial.run.status);
    if (initialState === "live") openStream(initial.run.lastEventSeq);
    else setState(initialState);
    return () => {
      mountedRef.current = false;
      cancelTimerRef.current?.();
      removeListenersRef.current?.();
      sourceRef.current?.close();
    };
  }, [initial.run.lastEventSeq, initial.run.status, openStream]);

  useEffect(() => {
    if (stateForRun(snapshot.run.status) !== "live") return;
    const timer = window.setInterval(() => void refreshSnapshot(false), 5_000);
    return () => window.clearInterval(timer);
  }, [refreshSnapshot, snapshot.run.status]);

  useEffect(() => {
    const resyncWhenActive = () => {
      if (document.visibilityState === "hidden") return;
      if (stateForRun(snapshotRef.current.run.status) !== "live") return;
      void refreshSnapshot(true);
    };
    window.addEventListener("online", resyncWhenActive);
    window.addEventListener("pageshow", resyncWhenActive);
    document.addEventListener("visibilitychange", resyncWhenActive);
    return () => {
      window.removeEventListener("online", resyncWhenActive);
      window.removeEventListener("pageshow", resyncWhenActive);
      document.removeEventListener("visibilitychange", resyncWhenActive);
    };
  }, [refreshSnapshot]);

  const createId = useCallback(
    () => (optionsRef.current.createId ?? crypto.randomUUID)(),
    [],
  );
  const cancel = useCallback(async () => {
    setState("cancelling");
    try {
      await optionsRef.current.client.cancelRun(
        snapshotRef.current.run.runId,
        createId(),
      );
      await resync();
    } catch (error) {
      setState(stateForRun(snapshotRef.current.run.status));
      throw error;
    }
  }, [createId, resync]);
  const retry = useCallback(async () => {
    const recovered = await optionsRef.current.client.retryRun(
      snapshotRef.current.run.runId,
      createId(),
    );
    await resync();
    return recovered;
  }, [createId, resync]);
  const reportId = useCallback(() => {
    const value = snapshotRef.current.run.reportId;
    if (value === undefined) {
      throw new ResearchCommandUnavailableError(
        "A published report is required",
      );
    }
    return value;
  }, []);
  const followUp = useCallback(
    async (question?: string) =>
      await optionsRef.current.client.followUp({
        reportId: reportId(),
        ...(question === undefined ? {} : { question }),
        idempotencyKey: createId(),
      }),
    [createId, reportId],
  );
  const askQuestion = useCallback(
    async (question: string) =>
      await optionsRef.current.client.askQuestion({
        reportId: reportId(),
        question,
        locale: snapshotRef.current.run.locale,
        idempotencyKey: createId(),
      }),
    [createId, reportId],
  );

  return useMemo(
    () => ({
      snapshot,
      state,
      lastEventSeq: snapshot.run.lastEventSeq,
      cancel,
      retry,
      followUp,
      askQuestion,
      resync,
    }),
    [askQuestion, cancel, followUp, resync, retry, snapshot, state],
  );
}
