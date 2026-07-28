import { describe, expect, it } from "vitest";
import {
  appendPublicEvent,
  createEventLedger,
  EventLedgerSchema,
  parsePublicEvent,
} from "./eventState";

const runId = "00000000-0000-4000-8000-000000000021";

describe("durable public event state", () => {
  it("appends strictly contiguous per-run events and preserves terminal order", () => {
    const ledger = createEventLedger(runId);

    const queued = appendPublicEvent(ledger, {
      id: "00000000-0000-4000-8000-000000000022",
      type: "run_queued",
      stateId: "queued",
      createdAt: "2026-07-22T00:00:00.000Z",
    });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    const published = appendPublicEvent(queued.ledger, {
      id: "00000000-0000-4000-8000-000000000023",
      type: "report_published",
      stateId: "completed",
      createdAt: "2026-07-22T00:01:00.000Z",
      reportId: "00000000-0000-4000-8000-000000000024",
    });

    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.ledger.events.map((event) => event.sequence)).toEqual([
      1, 2,
    ]);
    expect(published.ledger.events.at(-1)?.type).toBe("report_published");
  });

  it("rejects sequence gaps, duplicate terminal events, and private event fields", () => {
    const ledger = createEventLedger(runId);
    const queued = appendPublicEvent(ledger, {
      id: "00000000-0000-4000-8000-000000000025",
      type: "run_queued",
      stateId: "queued",
      createdAt: "2026-07-22T00:00:00.000Z",
    });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;

    const gap = parsePublicEvent({
      id: "00000000-0000-4000-8000-000000000026",
      runId,
      sequence: 3,
      type: "run_started",
      stateId: "running",
      createdAt: "2026-07-22T00:00:01.000Z",
    });
    expect(gap.success).toBe(true);
    if (!gap.success) return;
    const rejectedGap = appendPublicEvent(queued.ledger, gap.data);
    expect(rejectedGap.ok).toBe(false);
    if (rejectedGap.ok) return;
    expect(rejectedGap.error.kind).toBe("sequence_gap");

    const terminal = appendPublicEvent(queued.ledger, {
      id: "00000000-0000-4000-8000-000000000027",
      type: "run_cancelled",
      stateId: "cancelled",
      createdAt: "2026-07-22T00:00:02.000Z",
    });
    expect(terminal.ok).toBe(true);
    if (!terminal.ok) return;
    const duplicate = appendPublicEvent(terminal.ledger, {
      id: "00000000-0000-4000-8000-000000000028",
      type: "report_published",
      stateId: "completed",
      createdAt: "2026-07-22T00:00:03.000Z",
      reportId: "00000000-0000-4000-8000-000000000029",
    });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.error.kind).toBe("terminal_duplicate");

    const privateEvent = parsePublicEvent({
      id: "00000000-0000-4000-8000-000000000030",
      runId,
      sequence: 1,
      type: "run_started",
      stateId: "running",
      createdAt: "2026-07-22T00:00:01.000Z",
      prompt: "must not cross the public boundary",
    });
    expect(privateEvent.success).toBe(false);
  });

  it("rejects non-contiguous, duplicate, and terminal-out-of-order rehydrated ledgers", () => {
    const queued = appendPublicEvent(createEventLedger(runId), {
      id: "00000000-0000-4000-8000-000000000032",
      type: "run_queued",
      stateId: "queued",
      createdAt: "2026-07-22T00:00:00.000Z",
    });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    const started = appendPublicEvent(queued.ledger, {
      id: "00000000-0000-4000-8000-000000000033",
      type: "run_started",
      stateId: "running",
      createdAt: "2026-07-22T00:00:01.000Z",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const nonContiguous = EventLedgerSchema.safeParse({
      ...started.ledger,
      events: [
        started.ledger.events[0],
        { ...started.ledger.events[1], sequence: 3 },
      ],
    });
    expect(nonContiguous.success).toBe(false);

    const duplicateId = EventLedgerSchema.safeParse({
      ...started.ledger,
      events: [
        started.ledger.events[0],
        { ...started.ledger.events[1], id: started.ledger.events[0]?.id },
      ],
    });
    expect(duplicateId.success).toBe(false);

    const cancelled = appendPublicEvent(queued.ledger, {
      id: "00000000-0000-4000-8000-000000000034",
      type: "run_cancelled",
      stateId: "cancelled",
      createdAt: "2026-07-22T00:00:02.000Z",
    });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    const terminalOutOfOrder = EventLedgerSchema.safeParse({
      ...cancelled.ledger,
      nextSequence: 4,
      events: [
        ...cancelled.ledger.events,
        {
          id: "00000000-0000-4000-8000-000000000035",
          runId,
          sequence: 3,
          type: "run_started",
          stateId: "running",
          createdAt: "2026-07-22T00:00:03.000Z",
        },
      ],
    });
    expect(terminalOutOfOrder.success).toBe(false);

    const duplicateTerminal = EventLedgerSchema.safeParse({
      ...cancelled.ledger,
      nextSequence: 3,
      events: [
        ...cancelled.ledger.events,
        {
          id: "00000000-0000-4000-8000-000000000036",
          runId,
          sequence: 3,
          type: "run_failed",
          stateId: "failed",
          createdAt: "2026-07-22T00:00:03.000Z",
        },
      ],
    });
    expect(duplicateTerminal.success).toBe(false);
  });

  it("accepts only bilingual summary/detail records with no private or URL keys", () => {
    const valid = parsePublicEvent({
      id: "00000000-0000-4000-8000-000000000037",
      runId,
      sequence: 1,
      type: "run_started",
      stateId: "running",
      createdAt: "2026-07-22T00:00:01.000Z",
      summary: { en: "Started", ko: "시작" },
      detail: { en: "Public detail", ko: "공개 세부" },
    });
    expect(valid.success).toBe(true);

    const forbidden = parsePublicEvent({
      id: "00000000-0000-4000-8000-000000000038",
      runId,
      sequence: 1,
      type: "run_started",
      stateId: "running",
      createdAt: "2026-07-22T00:00:01.000Z",
      summary: { en: "Started", ko: "시작", reasoning: "private" },
      detail: { en: "See source", ko: "출처 보기", url: "https://example.com" },
    });
    expect(forbidden.success).toBe(false);
    const spawnWithoutJob = parsePublicEvent({
      id: "00000000-0000-4000-8000-000000000039",
      runId,
      sequence: 1,
      type: "spawn_reserved",
      stateId: "spawn-reserved",
      createdAt: "2026-07-22T00:00:01.000Z",
      attemptId: "00000000-0000-4000-8000-000000000040",
      ordinal: 1,
    });
    expect(spawnWithoutJob.success).toBe(false);
  });

  it("rejects a terminal event whose state ID is not terminal", () => {
    const event = parsePublicEvent({
      id: "00000000-0000-4000-8000-000000000031",
      runId,
      sequence: 1,
      type: "report_published",
      stateId: "running",
      createdAt: "2026-07-22T00:00:01.000Z",
    });
    expect(event.success).toBe(false);
  });
});
