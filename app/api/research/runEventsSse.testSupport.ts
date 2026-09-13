import { randomUUID } from "node:crypto";
import { afterEach, vi } from "vitest";
import { researchTransaction } from "../../../src/research/server/persistence/postgres/database";
import { serializeSafeJson } from "../../../src/research/server/persistence/postgres/safeJson";
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

export async function appendEvent(
  harness: ApiHarness,
  runId: string,
  input: TestEventInput,
): Promise<void> {
  const database = harness.database;
  await researchTransaction(database, async (database) => {
    await database.query(
      "UPDATE runs SET last_event_seq = $1, status = $2 WHERE run_id = $3",
      [input.sequence, input.status ?? "running", runId],
    );
    await database.query(
      `INSERT INTO run_events(
            run_id, sequence, event_id, event_type, state_id,
            occurred_at, payload_json
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
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
      ],
    );
  });
}

export async function pruneEvents(
  harness: ApiHarness,
  runId: string,
  through: number,
): Promise<void> {
  const database = harness.database;
  await database.query(
    "DELETE FROM run_events WHERE run_id = $1 AND sequence <= $2",
    [runId, through],
  );
}

export async function pruneSequence(
  harness: ApiHarness,
  runId: string,
  sequence: number,
): Promise<void> {
  const database = harness.database;
  await database.query(
    "DELETE FROM run_events WHERE run_id = $1 AND sequence = $2",
    [runId, sequence],
  );
}

export async function beginPendingEvent(
  harness: ApiHarness,
  runId: string,
  input: TestEventInput,
): Promise<{
  readonly commit: () => Promise<void>;
  readonly rollback: () => Promise<void>;
}> {
  const database = await harness.database.connect();
  await database.query("BEGIN");
  await database.query(
    "UPDATE runs SET last_event_seq = $1, status = $2 WHERE run_id = $3",
    [input.sequence, input.status ?? "running", runId],
  );
  await database.query(
    `INSERT INTO run_events(
      run_id, sequence, event_id, event_type, state_id,
      occurred_at, payload_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
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
    ],
  );
  let finished = false;
  const finish = async (statement: "COMMIT" | "ROLLBACK") => {
    if (finished) return;
    finished = true;
    try {
      await database.query(statement);
    } finally {
      database.release();
    }
  };
  return {
    commit: () => finish("COMMIT"),
    rollback: () => finish("ROLLBACK"),
  };
}

export async function runStatus(
  harness: ApiHarness,
  runId: string,
): Promise<string> {
  const database = harness.database;
  {
    const value: unknown = Object.values(
      (
        await database.query("SELECT status FROM runs WHERE run_id = $1", [
          runId,
        ])
      ).rows[0] ?? {},
    )[0];
    if (typeof value !== "string") throw new TypeError("Expected run status");
    return value;
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
