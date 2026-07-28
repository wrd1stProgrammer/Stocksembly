import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { cancellationPublicEvent } from "../server/persistence/sqlite/cancellationPublicEvent";

const CancellingRunSchema = z.object({
  run_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
});
const SequenceSchema = z.object({
  last_event_seq: z.number().int().positive(),
});

function recoverCancelledRuns(database: Database.Database, now: string): void {
  const runs = database
    .prepare(`SELECT DISTINCT runs.run_id, runs.snapshot_id FROM runs
      JOIN jobs USING(run_id) JOIN attempts USING(job_id)
      WHERE runs.status = 'cancelling' AND jobs.status = 'cancel-requested'
        AND attempts.status IN ('spawn-reserved', 'running')
        AND jobs.lease_expires_at <= ? ORDER BY runs.run_id`)
    .all(now)
    .map((row) => CancellingRunSchema.parse(row));
  if (runs.length === 0) return;
  database
    .prepare(`UPDATE attempts SET status = 'cancelled', outcome = 'cancelled'
      WHERE status IN ('spawn-reserved', 'running') AND attempt_id IN (
        SELECT attempts.attempt_id FROM attempts JOIN jobs USING(job_id)
        JOIN runs USING(run_id) WHERE runs.status = 'cancelling'
          AND jobs.status = 'cancel-requested' AND jobs.lease_expires_at <= @now
      )`)
    .run({ now });
  database
    .prepare(`UPDATE jobs SET status = 'cancelled', lease_owner = NULL,
      lease_expires_at = NULL WHERE status = 'cancel-requested' AND job_id IN (
        SELECT jobs.job_id FROM jobs JOIN runs USING(run_id)
        WHERE runs.status = 'cancelling' AND jobs.lease_expires_at <= @now
      )`)
    .run({ now });
  for (const run of runs) {
    const remaining = database
      .prepare(`SELECT 1 FROM jobs WHERE run_id = ?
        AND status = 'cancel-requested' LIMIT 1`)
      .get(run.run_id);
    if (remaining !== undefined) continue;
    const updatedValue = database
      .prepare(`UPDATE runs SET status = 'cancelled', version = version + 1,
        last_event_seq = last_event_seq + 1 WHERE run_id = ?
        AND status = 'cancelling' RETURNING last_event_seq`)
      .get(run.run_id);
    if (updatedValue === undefined) continue;
    const sequence = SequenceSchema.parse(updatedValue).last_event_seq;
    const event = cancellationPublicEvent({
      eventId: randomUUID(),
      runId: run.run_id,
      snapshotId: run.snapshot_id,
      sequence,
      kind: "run_cancelled",
      occurredAt: now,
    });
    database
      .prepare(`INSERT INTO run_events(run_id, sequence, event_id, event_type,
        state_id, occurred_at, payload_json) VALUES (@runId, @sequence,
        @eventId, @kind, @stateId, @occurredAt, @payloadJson)`)
      .run(event);
  }
}

export function recoverExpiredAttempts(
  database: Database.Database,
  now: string,
): readonly string[] {
  return database
    .transaction(() => {
      const rows = database
        .prepare<[string], { readonly attempt_id: string }>(
          `SELECT attempts.attempt_id FROM attempts JOIN jobs USING (job_id)
          WHERE attempts.status IN ('spawn-reserved', 'running')
            AND jobs.lease_expires_at <= ? ORDER BY attempts.created_at`,
        )
        .all(now);
      if (rows.length === 0) return [];
      recoverCancelledRuns(database, now);
      database
        .prepare(`UPDATE attempts SET status = 'unknown', outcome = 'unknown'
          WHERE status IN ('spawn-reserved', 'running') AND attempt_id IN (
            SELECT attempts.attempt_id FROM attempts JOIN jobs USING (job_id)
            WHERE jobs.lease_expires_at <= @now
          )`)
        .run({ now });
      database
        .prepare(`UPDATE questions SET status = 'failed'
          WHERE job_id IN (SELECT job_id FROM attempts
            WHERE kind = 'qa' AND status = 'unknown')
          AND status IN ('spawn_reserved', 'running')`)
        .run();
      database
        .prepare(`INSERT INTO idempotency_records(
          scope, idempotency_key, request_hash, result_json, created_at
        )
        SELECT 'worker-retry', jobs.job_id, jobs.input_hash, json_object(
          'retryAt', @now,
          'failureCount', COALESCE(
            json_extract(existing.result_json, '$.failureCount'), 0
          ) + 1,
          'circuitOpen', json('false'),
          'classification', 'transient',
          'code', 'lease_expired_unknown'
        ), @now
        FROM jobs
        JOIN attempts ON attempts.attempt_id = jobs.attempt_id
        LEFT JOIN idempotency_records AS existing
          ON existing.scope = 'worker-retry'
          AND existing.idempotency_key = jobs.job_id
        WHERE jobs.kind = 'research' AND attempts.status = 'unknown'
        ON CONFLICT(scope, idempotency_key) DO UPDATE SET
          result_json = excluded.result_json,
          created_at = excluded.created_at`)
        .run({ now });
      database
        .prepare(`UPDATE jobs SET status = 'failed'
          WHERE kind = 'qa' AND attempt_id IN (
            SELECT attempt_id FROM attempts WHERE status = 'unknown'
          )`)
        .run();
      database
        .prepare(`UPDATE jobs SET status = 'retry-wait', lease_owner = NULL,
          lease_expires_at = NULL WHERE kind = 'research' AND attempt_id IN (
            SELECT attempt_id FROM attempts WHERE status = 'unknown'
          )`)
        .run();
      return rows.map((row) => row.attempt_id);
    })
    .immediate();
}
