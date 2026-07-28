import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  EventIdSchema,
  JobIdSchema,
  QuestionIdSchema,
  ReportIdSchema,
  ReportVersionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import type { CreateRunInput } from "./types";

const execFileAsync = promisify(execFile);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

export function hash(value: number): string {
  return (value % 16).toString(16).repeat(64);
}

export function at(second: number): string {
  return `2026-07-22T00:00:${String(second).padStart(2, "0")}.000Z`;
}

export function fixture(seed: number) {
  const base = seed * 100;
  return {
    runId: RunIdSchema.parse(uuid(base + 1)),
    snapshotId: SnapshotIdSchema.parse(uuid(base + 2)),
    jobId: JobIdSchema.parse(uuid(base + 3)),
    nextJobId: JobIdSchema.parse(uuid(base + 4)),
    thirdJobId: JobIdSchema.parse(uuid(base + 5)),
    attemptId: AttemptIdSchema.parse(uuid(base + 6)),
    nextAttemptId: AttemptIdSchema.parse(uuid(base + 7)),
    thirdAttemptId: AttemptIdSchema.parse(uuid(base + 8)),
    initialEventId: EventIdSchema.parse(uuid(base + 9)),
    eventId: EventIdSchema.parse(uuid(base + 10)),
    nextEventId: EventIdSchema.parse(uuid(base + 11)),
    thirdEventId: EventIdSchema.parse(uuid(base + 12)),
    artifactId: ArtifactIdSchema.parse(uuid(base + 13)),
    parentArtifactId: ArtifactIdSchema.parse(uuid(base + 14)),
    reportId: ReportIdSchema.parse(uuid(base + 15)),
    versionId: ReportVersionIdSchema.parse(uuid(base + 16)),
    questionId: QuestionIdSchema.parse(uuid(base + 17)),
  };
}

export function createRunFixture(seed: number): CreateRunInput {
  const ids = fixture(seed);
  return {
    runId: ids.runId,
    snapshotId: ids.snapshotId,
    requestedAt: at(0),
    initialJob: {
      jobId: ids.jobId,
      kind: "research",
      logicalKey: `research:${seed}`,
      inputHash: hash(seed),
      createdAt: at(0),
    },
    initialEvent: {
      eventId: ids.initialEventId,
      type: "run_queued",
      stateId: "queued",
      occurredAt: at(0),
      payload: { phase: "queued" },
    },
  };
}

export function temporaryDatabase(): {
  readonly directory: string;
  readonly path: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "stocksembly-sqlite-contract-"));
  return { directory, path: join(directory, "workflow.sqlite") };
}

const appendScript = `
  import Database from "better-sqlite3";
  const [path, runId, eventId] = process.argv.slice(1);
  const database = new Database(path, { timeout: 5000 });
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  database.exec("BEGIN IMMEDIATE");
  try {
    const row = database.prepare(
      "UPDATE runs SET last_event_seq = last_event_seq + 1 WHERE run_id = ? RETURNING last_event_seq"
    ).get(runId);
    database.prepare(
      "INSERT INTO run_events(run_id, sequence, event_id, event_type, state_id, occurred_at, payload_json) VALUES (?, ?, ?, 'state_committed', 'running', '2026-07-22T00:00:02.000Z', '{}')"
    ).run(runId, row.last_event_seq, eventId);
    database.exec("COMMIT");
    process.stdout.write(String(row.last_event_seq));
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
`;

export async function appendFromSecondProcess(
  path: string,
  runId: string,
  eventId: string,
): Promise<number> {
  const result = await execFileAsync(
    process.execPath,
    ["--input-type=module", "-e", appendScript, path, runId, eventId],
    { cwd: process.cwd() },
  );
  return Number.parseInt(result.stdout.trim(), 10);
}
