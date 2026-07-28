import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResearchRequestError } from "./api";
import { useResearchRun } from "./useResearchRun";
import {
  client,
  detail,
  FakeEventSource,
  publicEvent,
  RUN_ID,
} from "./useResearchRun.testSupport";

describe("useResearchRun durable projection", () => {
  it("starts at the snapshot cursor, reduces the next event once, and resyncs a gap", async () => {
    // Given
    const sources: {
      readonly url: string;
      readonly source: FakeEventSource;
    }[] = [];
    const refreshed = detail(15);
    const getRun = vi.fn(async () => ({
      ...refreshed,
      events: [publicEvent(13), publicEvent(14), publicEvent(15)],
    }));

    // When
    const researchClient = client(getRun);
    const { result } = renderHook(() =>
      useResearchRun(detail(), {
        client: researchClient,
        createEventSource: (url) => {
          const source = new FakeEventSource();
          sources.push({ url, source });
          return source;
        },
      }),
    );
    act(() => sources[0]?.source.onopen?.());
    act(() => sources[0]?.source.emit(publicEvent(13)));
    act(() => sources[0]?.source.emit(publicEvent(13)));
    act(() => sources[0]?.source.emit(publicEvent(15)));

    // Then
    await waitFor(() => expect(result.current.lastEventSeq).toBe(15));
    expect(sources[0]?.url).toBe(
      `/api/research/runs/${RUN_ID}/events?after=12`,
    );
    expect(
      result.current.snapshot.events.map((event) => event.sequence),
    ).toEqual([13, 14, 15]);
    expect(getRun).toHaveBeenCalledOnce();
  });

  it("keeps native reconnect available, then enters reauthentication on fallback 401", async () => {
    // Given
    const source = new FakeEventSource();
    const callbacks: (() => void)[] = [];
    const getRun = vi.fn(async () => {
      throw new ResearchRequestError(401, "AUTHENTICATION_REQUIRED");
    });
    const reauthenticate = vi.fn();
    const researchClient = client(getRun);

    // When
    const { result } = renderHook(() =>
      useResearchRun(detail(), {
        client: researchClient,
        createEventSource: () => source,
        schedule: (callback) => {
          callbacks.push(callback);
          return () => undefined;
        },
        reauthenticate,
      }),
    );
    act(() => source.onerror?.());
    expect(source.closed).toBe(false);
    await act(async () => callbacks[0]?.());

    // Then
    await waitFor(() => expect(result.current.state).toBe("reauthenticating"));
    expect(researchClient.bootstrapSession).toHaveBeenCalledOnce();
    expect(reauthenticate).toHaveBeenCalledOnce();
  });

  it("reconciles a silent event stream with the durable terminal snapshot", async () => {
    vi.useFakeTimers();
    try {
      // Given
      const source = new FakeEventSource();
      const failed = {
        ...detail(20, "failed"),
        events: [publicEvent(20, "run_failed")],
      };
      const getRun = vi.fn(async () => failed);
      const { result } = renderHook(() =>
        useResearchRun(detail(), {
          client: client(getRun),
          createEventSource: () => source,
        }),
      );
      act(() => source.onopen?.());

      // When
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      // Then
      expect(getRun).toHaveBeenCalledOnce();
      expect(result.current.lastEventSeq).toBe(20);
      expect(result.current.state).toBe("failed");
      expect(source.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts ordered events through publication and ignores the duplicate terminal", async () => {
    // Given
    const source = new FakeEventSource();
    const { result } = renderHook(() =>
      useResearchRun(detail(), {
        client: client(),
        createEventSource: () => source,
      }),
    );

    // When
    act(() => {
      for (let sequence = 13; sequence < 20; sequence += 1) {
        source.emit(publicEvent(sequence));
      }
      source.emit(publicEvent(20, "report_published"));
      source.emit(publicEvent(20, "report_published"));
    });

    // Then
    expect(result.current.lastEventSeq).toBe(20);
    expect(result.current.snapshot.events).toHaveLength(8);
    expect(result.current.state).toBe("published");
    expect(source.closed).toBe(true);
  });

  it("rejects an SSE id mismatch and atomically restores the durable snapshot", async () => {
    // Given
    const sources: FakeEventSource[] = [];
    const getRun = vi.fn(async () => ({
      ...detail(13),
      events: [publicEvent(13)],
    }));
    const { result } = renderHook(() =>
      useResearchRun(detail(), {
        client: client(getRun),
        createEventSource: () => {
          const source = new FakeEventSource();
          sources.push(source);
          return source;
        },
      }),
    );

    // When
    act(() =>
      sources[0]?.emitRaw(
        "specialist_memo_committed",
        JSON.stringify(publicEvent(13)),
        "14",
      ),
    );

    // Then
    await waitFor(() => expect(result.current.lastEventSeq).toBe(13));
    expect(sources[0]?.closed).toBe(true);
    expect(getRun).toHaveBeenCalledOnce();
  });

  it("uses durable cancel, retry, follow-up, and question commands with fresh keys", async () => {
    // Given
    const reportId = "00000000-0000-4000-8000-000000000003";
    const cancelled = detail(13, "cancelled");
    const researchClient = client(vi.fn(async () => cancelled));
    const createId = vi
      .fn<() => string>()
      .mockReturnValueOnce("cancel-key")
      .mockReturnValueOnce("retry-key")
      .mockReturnValueOnce("follow-key")
      .mockReturnValueOnce("question-key");
    const active = renderHook(() =>
      useResearchRun(detail(), {
        client: researchClient,
        createEventSource: () => new FakeEventSource(),
        createId,
      }),
    );
    const published = renderHook(() =>
      useResearchRun(detail(20, "completed", reportId), {
        client: researchClient,
        createEventSource: () => new FakeEventSource(),
        createId,
      }),
    );

    // When
    await act(async () => active.result.current.cancel());
    await act(async () => active.result.current.retry());
    await act(async () =>
      published.result.current.followUp("Reassess margins"),
    );
    await act(async () => published.result.current.askQuestion("Why margins?"));

    // Then
    expect(researchClient.cancelRun).toHaveBeenCalledWith(RUN_ID, "cancel-key");
    expect(researchClient.retryRun).toHaveBeenCalledWith(RUN_ID, "retry-key");
    expect(researchClient.followUp).toHaveBeenCalledWith({
      reportId,
      question: "Reassess margins",
      idempotencyKey: "follow-key",
    });
    expect(researchClient.askQuestion).toHaveBeenCalledWith({
      reportId,
      question: "Why margins?",
      locale: "en",
      idempotencyKey: "question-key",
    });
  });
});
