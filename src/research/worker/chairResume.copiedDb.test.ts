import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { AttemptIdSchema, EventIdSchema } from "../domain/ids";
import { chairResumeReceiptExceptionAvailable } from "../workflow/chairResumePermit";
import { ChairSynthesisPromptSchema } from "../workflow/chairSynthesisContracts";
import { resumeCommitteeChair } from "./chairResume";
import { SqliteLeaseEngineStore } from "./leaseEngineSqlite";

const SOURCE = join(
  process.cwd(),
  ".omo/evidence/task-13-research-editorial-system-rebuild/chair-debug/copied-research.sqlite",
);
const RUN_ID = "6bcce9de-f1b2-4eda-878f-290a7d0f6713";
const CHAIR_JOB_ID = "e48a2d93-8ebc-4555-812b-659504c80b46";
const directories: string[] = [];

function copiedDatabase(): string {
  const directory = mkdtempSync(join(tmpdir(), "chair-resume-copy-"));
  directories.push(directory);
  const path = join(directory, "research.sqlite");
  copyFileSync(SOURCE, path);
  const database = new Database(path);
  database
    .prepare("DELETE FROM idempotency_records WHERE scope = 'chair-resume'")
    .run();
  database
    .prepare("UPDATE runs SET status = 'incomplete' WHERE run_id = ?")
    .run(RUN_ID);
  database
    .prepare(
      "UPDATE jobs SET status = 'retry-wait', lease_owner = NULL, lease_expires_at = NULL WHERE job_id = ?",
    )
    .run(CHAIR_JOB_ID);
  database
    .prepare(`UPDATE idempotency_records SET result_json = json_set(
      result_json, '$.retryAt', '2026-08-01T00:00:00.000Z',
      '$.failureCount', 2, '$.circuitOpen', json('true'),
      '$.classification', 'transient',
      '$.code', 'external_dependency_circuit_open')
      WHERE scope = 'worker-retry' AND idempotency_key = ?`)
    .run(CHAIR_JOB_ID);
  database.close();
  return path;
}

function authorization(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory !== undefined)
      rmSync(directory, { recursive: true, force: true });
  }
});

describe.skipIf(!existsSync(SOURCE))("bounded copied-DB chair resume", () => {
  it("keeps the persisted chair validation prompt schema-valid", () => {
    const path = copiedDatabase();
    const database = new Database(path, { readonly: true });
    const row = database
      .prepare(`SELECT result_json FROM idempotency_records
        WHERE scope = 'chair-synthesis-job' AND idempotency_key = ?`)
      .get(RUN_ID) as { readonly result_json: string };
    database.close();
    const job = JSON.parse(row.result_json) as {
      readonly validationPrompt: string;
    };
    expect(
      ChairSynthesisPromptSchema.safeParse(JSON.parse(job.validationPrompt)),
    ).toMatchObject({ success: true });
  });
  it("reopens and claims only chair without changing upstream history", () => {
    const path = copiedDatabase();
    const before = new Database(path, { readonly: true });
    const upstreamEvents = before
      .prepare(
        "SELECT COUNT(*) AS count FROM run_events WHERE run_id = ? AND event_type <> 'run_incomplete'",
      )
      .get(RUN_ID) as { readonly count: number };
    before.close();

    const resumed = resumeCommitteeChair({
      databasePath: path,
      runId: RUN_ID,
      authorizationId: authorization(1),
      now: "2026-08-01T03:20:00.000Z",
    });

    expect(resumed).toMatchObject({ kind: "resumed", grantedLaunch: 0 });
    const database = new Database(path);
    const candidate = database
      .prepare(`WITH scheduled_research_runs AS (
        SELECT run_id FROM runs WHERE status = 'running'
      ) SELECT jobs.logical_key FROM jobs JOIN runs USING(run_id)
      LEFT JOIN idempotency_records retry ON retry.scope = 'worker-retry'
        AND retry.idempotency_key = jobs.job_id
      WHERE jobs.run_id IN scheduled_research_runs AND (
        jobs.status = 'queued' OR (jobs.status = 'retry-wait'
          AND COALESCE(json_extract(retry.result_json, '$.circuitOpen'), 0) = 0
          AND COALESCE(json_extract(retry.result_json, '$.retryAt'), '') <= ?))
      ORDER BY jobs.created_at, jobs.job_id LIMIT 1`)
      .get("2026-08-01T03:20:01.000Z");
    const afterEvents = database
      .prepare(
        "SELECT COUNT(*) AS count FROM run_events WHERE run_id = ? AND event_type <> 'run_incomplete' AND event_type <> 'chair_resume_authorized'",
      )
      .get(RUN_ID) as { readonly count: number };
    expect(candidate).toEqual({ logical_key: "chair_synthesis:chair" });
    expect(afterEvents.count).toBe(upstreamEvents.count);
    expect(
      resumeCommitteeChair({
        databasePath: path,
        runId: RUN_ID,
        authorizationId: authorization(1),
        now: "2026-08-01T03:20:02.000Z",
      }),
    ).toMatchObject({ kind: "already_applied" });
    expect(
      resumeCommitteeChair({
        databasePath: path,
        runId: RUN_ID,
        authorizationId: authorization(2),
        now: "2026-08-01T03:20:03.000Z",
      }),
    ).toEqual({ kind: "rejected", reason: "already_resumed" });
    database.close();
  });

  it.each([
    ["wrong_status", "UPDATE runs SET status = 'failed' WHERE run_id = ?"],
    [
      "upstream_incomplete",
      "UPDATE jobs SET status = 'failed' WHERE run_id = ? AND logical_key = 'memo:market'",
    ],
    [
      "wrong_stage",
      "UPDATE jobs SET logical_key = 'chair_other:chair' WHERE run_id = ? AND logical_key = 'chair_synthesis:chair'",
    ],
    [
      "wrong_target",
      "UPDATE research_requests SET research_kind = 'department' WHERE run_id = ?",
    ],
    [
      "circuit_not_retryable",
      "UPDATE idempotency_records SET result_json = json_set(result_json, '$.circuitOpen', json('false')) WHERE scope = 'worker-retry' AND idempotency_key IN (SELECT job_id FROM jobs WHERE run_id = ? AND logical_key = 'chair_synthesis:chair')",
    ],
  ] as const)("rejects %s", (reason, mutation) => {
    const path = copiedDatabase();
    const database = new Database(path);
    database.prepare(mutation).run(RUN_ID);
    database.close();
    expect(
      resumeCommitteeChair({
        databasePath: path,
        runId: RUN_ID,
        authorizationId: authorization(10),
        now: "2026-08-01T03:20:00.000Z",
      }),
    ).toEqual({ kind: "rejected", reason });
  });

  it("rejects multiple chair jobs and an existing publication", () => {
    const multiple = copiedDatabase();
    const multipleDb = new Database(multiple);
    multipleDb
      .prepare(`INSERT INTO jobs(job_id, run_id, snapshot_id, kind,
        logical_key, input_hash, status, created_at)
        SELECT '00000000-0000-4000-8000-000000000099', run_id, snapshot_id,
        'research', 'chair_synthesis:backup',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'retry-wait', created_at FROM runs WHERE run_id = ?`)
      .run(RUN_ID);
    multipleDb.close();
    expect(
      resumeCommitteeChair({
        databasePath: multiple,
        runId: RUN_ID,
        authorizationId: authorization(20),
        now: "2026-08-01T03:20:00.000Z",
      }),
    ).toEqual({ kind: "rejected", reason: "multiple_chair_jobs" });

    const published = copiedDatabase();
    const publishedDb = new Database(published);
    publishedDb
      .prepare(`INSERT INTO reports(report_id, run_id, snapshot_id, state, created_at)
        SELECT '00000000-0000-4000-8000-000000000098', run_id, snapshot_id,
        'published', created_at FROM runs WHERE run_id = ?`)
      .run(RUN_ID);
    publishedDb.close();
    expect(
      resumeCommitteeChair({
        databasePath: published,
        runId: RUN_ID,
        authorizationId: authorization(21),
        now: "2026-08-01T03:20:00.000Z",
      }),
    ).toEqual({ kind: "rejected", reason: "report_published" });
  });

  it("consumes one authorization exactly once across concurrent callers", async () => {
    const path = copiedDatabase();
    const input = {
      databasePath: path,
      runId: RUN_ID,
      authorizationId: authorization(30),
      now: "2026-08-01T03:20:00.000Z",
    };

    const results = await Promise.all([
      Promise.resolve().then(() => resumeCommitteeChair(input)),
      Promise.resolve().then(() => resumeCommitteeChair(input)),
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual([
      "already_applied",
      "resumed",
    ]);
    const database = new Database(path, { readonly: true });
    const events = database
      .prepare(
        "SELECT COUNT(*) AS count FROM run_events WHERE run_id = ? AND event_type = 'chair_resume_authorized'",
      )
      .get(RUN_ID) as { readonly count: number };
    expect(events.count).toBe(1);
    database.close();
  });

  it("reactivates the same authorization and consumes its receipt exception at chair reservation", () => {
    const path = copiedDatabase();
    const authorizationId = authorization(40);
    expect(
      resumeCommitteeChair({
        databasePath: path,
        runId: RUN_ID,
        authorizationId,
        now: "2026-08-01T03:20:00.000Z",
      }),
    ).toMatchObject({ kind: "resumed" });
    const database = new Database(path);
    const sequence = (
      database
        .prepare(`UPDATE runs SET status = 'incomplete',
          last_event_seq = last_event_seq + 1 WHERE run_id = ?
          RETURNING last_event_seq`)
        .get(RUN_ID) as { readonly last_event_seq: number }
    ).last_event_seq;
    database
      .prepare(`INSERT INTO run_events(run_id, sequence, event_id, event_type,
        state_id, occurred_at, payload_json) VALUES (?, ?, ?, 'run_incomplete',
        'incomplete', ?, json_object('code',
          'chair_synthesis:replacement_exhausted'))`)
      .run(RUN_ID, sequence, authorization(41), "2026-08-01T03:20:01.000Z");
    database.close();

    expect(
      resumeCommitteeChair({
        databasePath: path,
        runId: RUN_ID,
        authorizationId,
        now: "2026-08-01T03:20:02.000Z",
      }),
    ).toMatchObject({ kind: "already_applied" });
    expect(chairResumeReceiptExceptionAvailable(path, RUN_ID)).toBe(true);

    const store = new SqliteLeaseEngineStore(path);
    const claim = store.claim(
      "receipt-exception-worker",
      "2026-08-01T03:20:03.000Z",
      "2026-08-01T03:20:33.000Z",
    );
    expect(claim?.logicalKey).toBe("chair_synthesis:chair");
    if (claim === undefined) throw new Error("chair claim missing");
    expect(
      store.reserve({
        claim,
        attemptId: AttemptIdSchema.parse(authorization(42)),
        eventId: EventIdSchema.parse(authorization(43)),
        now: "2026-08-01T03:20:03.000Z",
      }),
    ).toMatchObject({ kind: "reserved" });
    store.close();
    expect(chairResumeReceiptExceptionAvailable(path, RUN_ID)).toBe(false);
  });
});
