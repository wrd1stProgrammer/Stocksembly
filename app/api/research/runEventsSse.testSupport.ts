import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { afterEach, vi } from "vitest";
import { serializeSafeJson } from "../../../src/research/server/persistence/sqlite/safeJson";
import {
  type ApiHarness,
  createApiHarness,
  createRunRequest,
} from "./researchRoutes.testSupport";

export type TestEventInput = {
  readonly sequence: number;
  readonly kind?: string;
  readonly status?:
    | "queued"
    | "running"
    | "completed"
    | "complete-with-limitations"
    | "cancelled"
    | "failed"
    | "incomplete";
};

export function appendEvent(
  harness: ApiHarness,
  runId: string,
  input: TestEventInput,
): void {
  const database = new Database(harness.databasePath);
  try {
    database
      .transaction(() => {
        database
          .prepare(
            "UPDATE runs SET last_event_seq = ?, status = ? WHERE run_id = ?",
          )
          .run(input.sequence, input.status ?? "running", runId);
        database
          .prepare(`INSERT INTO run_events(
            run_id, sequence, event_id, event_type, state_id,
            occurred_at, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(
            runId,
            input.sequence,
            randomUUID(),
            input.kind ?? "collection_started",
            `state-${input.sequence}`,
            `2026-07-23T06:00:${String(input.sequence).padStart(2, "0")}.000Z`,
            serializeSafeJson({
              participantIds: [],
              claimIds: [],
              sourceIds: [],
              limitationIds: [],
              summary: {
                en: `Public event ${input.sequence}`,
                ko: `공개 이벤트 ${input.sequence}`,
              },
              privateThought: "must never cross the boundary",
            }),
          );
      })
      .immediate();
  } finally {
    database.close();
  }
}

export function pruneEvents(
  harness: ApiHarness,
  runId: string,
  through: number,
): void {
  const database = new Database(harness.databasePath);
  try {
    database
      .prepare("DELETE FROM run_events WHERE run_id = ? AND sequence <= ?")
      .run(runId, through);
  } finally {
    database.close();
  }
}

export function pruneSequence(
  harness: ApiHarness,
  runId: string,
  sequence: number,
): void {
  const database = new Database(harness.databasePath);
  try {
    database
      .prepare("DELETE FROM run_events WHERE run_id = ? AND sequence = ?")
      .run(runId, sequence);
  } finally {
    database.close();
  }
}

export function beginPendingEvent(
  harness: ApiHarness,
  runId: string,
  input: TestEventInput,
): { readonly commit: () => void; readonly rollback: () => void } {
  const database = new Database(harness.databasePath);
  database.exec("BEGIN IMMEDIATE");
  database
    .prepare("UPDATE runs SET last_event_seq = ?, status = ? WHERE run_id = ?")
    .run(input.sequence, input.status ?? "running", runId);
  database
    .prepare(`INSERT INTO run_events(
      run_id, sequence, event_id, event_type, state_id,
      occurred_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(
      runId,
      input.sequence,
      randomUUID(),
      input.kind ?? "collection_started",
      `state-${input.sequence}`,
      `2026-07-23T06:01:${String(input.sequence).padStart(2, "0")}.000Z`,
      serializeSafeJson({
        participantIds: [],
        claimIds: [],
        sourceIds: [],
        limitationIds: [],
        summary: { en: "Committed public event", ko: "커밋된 공개 이벤트" },
      }),
    );
  const finish = (statement: "COMMIT" | "ROLLBACK") => {
    if (!database.open) return;
    database.exec(statement);
    database.close();
  };
  return {
    commit: () => finish("COMMIT"),
    rollback: () => finish("ROLLBACK"),
  };
}

export function runStatus(harness: ApiHarness, runId: string): string {
  const database = new Database(harness.databasePath, { readonly: true });
  try {
    const value: unknown = database
      .prepare("SELECT status FROM runs WHERE run_id = ?")
      .pluck()
      .get(runId);
    if (typeof value !== "string") throw new TypeError("Expected run status");
    return value;
  } finally {
    database.close();
  }
}

export async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string | undefined> {
  const result = await reader.read();
  return result.done ? undefined : new TextDecoder().decode(result.value);
}

export function eventId(frame: string): number {
  const match = /^id: ([0-9]+)$/mu.exec(frame)?.[1];
  if (match === undefined) throw new TypeError("Expected an SSE event id");
  return Number(match);
}

export function registerSseHarnessCleanup(): () => Promise<ApiHarness> {
  const harnesses: ApiHarness[] = [];
  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(harnesses.splice(0).map((value) => value.close()));
  });
  return async () => {
    const value = await createApiHarness();
    harnesses.push(value);
    return value;
  };
}

export async function createRun(value: ApiHarness): Promise<string> {
  const response = await value.api.handle(createRunRequest(value, "sse-red"));
  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("run" in payload) ||
    typeof payload.run !== "object" ||
    payload.run === null ||
    !("runId" in payload.run) ||
    typeof payload.run.runId !== "string"
  ) {
    throw new TypeError("Expected a run creation response");
  }
  return payload.run.runId;
}

export function streamRequest(
  value: ApiHarness,
  runId: string,
  suffix = "",
  headers?: HeadersInit,
): Request {
  return value.request(
    `/api/research/runs/${runId}/events${suffix}`,
    headers === undefined ? {} : { headers },
  );
}

export function responseReader(
  response: Response,
): ReadableStreamDefaultReader<Uint8Array> {
  if (response.body === null) throw new TypeError("Expected an SSE body");
  return response.body.getReader();
}
