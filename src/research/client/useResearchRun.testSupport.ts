import { vi } from "vitest";
import type { ResearchClient } from "./api";
import type {
  ChildRun,
  PublicQuestion,
  PublicResearchEvent,
  PublicRunDetail,
  RecoveredRun,
} from "./schemas";
import type { ResearchEventSource } from "./useResearchRun";

export const RUN_ID = "00000000-0000-4000-8000-000000000001";
export const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000002";

export function detail(
  lastEventSeq = 12,
  status: PublicRunDetail["run"]["status"] = "running",
  reportId?: string,
): PublicRunDetail {
  return {
    run: {
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      symbol: "NVDA",
      locale: "en",
      status,
      lastEventSeq,
      createdAt: "2026-07-23T06:00:00.000Z",
      ...(reportId === undefined ? {} : { reportId }),
    },
    events: [],
  };
}

export function publicEvent(
  sequence: number,
  kind: PublicResearchEvent["kind"] = "specialist_memo_committed",
): PublicResearchEvent {
  return {
    sequence,
    kind,
    occurredAt: "2026-07-23T06:01:00.000Z",
    stateId: `memo-${sequence}`,
    summary: { en: `Memo ${sequence}`, ko: `메모 ${sequence}` },
    participantIds: [],
    claimIds: [],
    sourceIds: [],
    limitationIds: [],
    ...(kind === "report_published" ? { reportId: RUN_ID } : {}),
  };
}

export class FakeEventSource implements ResearchEventSource {
  readonly listeners = new Map<
    string,
    readonly ((event: MessageEvent<string>) => void)[]
  >();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  listen(
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ): () => void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    return () => {
      this.listeners.set(
        type,
        (this.listeners.get(type) ?? []).filter((value) => value !== listener),
      );
    };
  }

  emit(event: PublicResearchEvent): void {
    this.emitRaw(event.kind, JSON.stringify(event), String(event.sequence));
  }

  emitRaw(type: string, data: string, lastEventId: string): void {
    const message = new MessageEvent<string>(type, { data, lastEventId });
    for (const listener of this.listeners.get(type) ?? []) listener(message);
  }

  close(): void {
    this.closed = true;
  }
}

export function client(getRun = vi.fn(async () => detail())): ResearchClient {
  return {
    bootstrapSession: vi.fn(async () => undefined),
    startRun: vi.fn(async () => detail()),
    getRun,
    cancelRun: vi.fn(async () => undefined),
    retryRun: vi.fn(
      async (): Promise<RecoveredRun> => ({
        runId: RUN_ID,
        snapshotId: SNAPSHOT_ID,
        status: "running",
        recovery: "same-run-stage-resume",
      }),
    ),
    followUp: vi.fn(
      async (): Promise<ChildRun> => ({
        runId: RUN_ID,
        snapshotId: SNAPSHOT_ID,
        status: "queued",
        parentRunId: RUN_ID,
        lineage: "new-snapshot-follow-up",
      }),
    ),
    askQuestion: vi.fn(
      async (): Promise<PublicQuestion> => ({
        questionId: RUN_ID,
        reportId: RUN_ID,
        reportVersionId: SNAPSHOT_ID,
        attemptOrdinal: 1,
        status: "pending",
        activity: "thinking",
        question: { en: "Why?", ko: "왜?" },
        createdAt: "2026-07-23T06:00:00.000Z",
      }),
    ),
    getQuestion: vi.fn(
      async (): Promise<PublicQuestion> => ({
        questionId: RUN_ID,
        reportId: RUN_ID,
        reportVersionId: SNAPSHOT_ID,
        attemptOrdinal: 1,
        status: "pending",
        activity: "thinking",
        question: { en: "Why?", ko: "왜?" },
        createdAt: "2026-07-23T06:00:00.000Z",
      }),
    ),
  };
}
