import { randomUUID } from "node:crypto";
import { z } from "zod";
import { cancellationPublicEvent } from "../server/persistence/postgres/cancellationPublicEvent";
import {
  type ResearchDatabase,
  researchTransaction,
} from "../server/persistence/postgres/database";

const CancellingRunSchema = z.object({
  run_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
});
const SequenceSchema = z.object({
  last_event_seq: z.coerce.number().int().positive(),
});

async function recoverCancelledRuns(
  database: ResearchDatabase,
  now: string,
): Promise<void> {
  const runs = (
    await database.query(
      `SELECT DISTINCT runs.run_id, runs.snapshot_id FROM runs
      JOIN jobs USING(run_id) JOIN attempts USING(job_id)
      WHERE runs.status = 'cancelling' AND jobs.status = 'cancel-requested'
        AND attempts.status IN ('spawn-reserved', 'running')
        AND jobs.lease_expires_at <= $1 ORDER BY runs.run_id`,
      [now],
    )
  ).rows.map((row) => CancellingRunSchema.parse(row));
  if (runs.length === 0) return;
  await database.query(
    `UPDATE attempts SET status = 'cancelled', outcome = 'cancelled'
      WHERE status IN ('spawn-reserved', 'running') AND attempt_id IN (
        SELECT attempts.attempt_id FROM attempts JOIN jobs USING(job_id)
        JOIN runs ON runs.run_id = jobs.run_id WHERE runs.status = 'cancelling'
          AND jobs.status = 'cancel-requested' AND jobs.lease_expires_at <= $1
      )`,
    [now],
  );
  await database.query(
    `UPDATE jobs SET status = 'cancelled', lease_owner = NULL,
      lease_expires_at = NULL WHERE status = 'cancel-requested' AND job_id IN (
        SELECT jobs.job_id FROM jobs JOIN runs ON runs.run_id = jobs.run_id
        WHERE runs.status = 'cancelling' AND jobs.lease_expires_at <= $1
      )`,
    [now],
  );
  for (const run of runs) {
    const remaining = (
      await database.query(
        `SELECT 1 FROM jobs WHERE run_id = $1
        AND status = 'cancel-requested' LIMIT 1`,
        [run.run_id],
      )
    ).rows[0];
    if (remaining !== undefined) continue;
    const updatedValue = (
      await database.query(
        `UPDATE runs SET status = 'cancelled', version = version + 1,
        last_event_seq = last_event_seq + 1 WHERE run_id = $1
        AND status = 'cancelling' RETURNING last_event_seq`,
        [run.run_id],
      )
    ).rows[0];
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
    await database.query(
      `INSERT INTO run_events(run_id, sequence, event_id, event_type,
        state_id, occurred_at, payload_json) VALUES ($1, $2,
        $3, $4, $5, $6, $7)`,
      [
        event.runId,
        event.sequence,
        event.eventId,
        event.kind,
        event.stateId,
        event.occurredAt,
        event.payloadJson,
      ],
    );
  }
}

export async function recoverExpiredAttempts(
  database: ResearchDatabase,
  now: string,
): Promise<readonly string[]> {
  return researchTransaction(database, async (database) => {
    await database.query("SELECT pg_advisory_xact_lock(73921402)");
    await database.query(
      "SELECT run_id FROM runs WHERE status IN ('running', 'cancelling') ORDER BY run_id FOR UPDATE",
    );
    const rows = (
      await database.query(
        `SELECT attempts.attempt_id FROM attempts JOIN jobs USING (job_id)
          WHERE attempts.status IN ('spawn-reserved', 'running')
            AND jobs.lease_expires_at <= $1 ORDER BY attempts.created_at`,
        [now],
      )
    ).rows;
    if (rows.length === 0) return [];
    await recoverCancelledRuns(database, now);
    await database.query(
      `UPDATE attempts SET status = 'unknown', outcome = 'unknown'
          WHERE status IN ('spawn-reserved', 'running') AND attempt_id IN (
            SELECT attempts.attempt_id FROM attempts JOIN jobs USING (job_id)
            WHERE jobs.lease_expires_at <= $1
          )`,
      [now],
    );
    await database.query(`UPDATE questions SET status = 'failed'
          WHERE job_id IN (SELECT job_id FROM attempts
            WHERE kind = 'qa' AND status = 'unknown')
          AND status IN ('spawn_reserved', 'running')`);
    await database.query(
      `INSERT INTO idempotency_records(
          scope, idempotency_key, request_hash, result_json, created_at
        )
        SELECT 'worker-retry', jobs.job_id, jobs.input_hash, jsonb_build_object(
          'retryAt', $1::text,
          'failureCount', COALESCE(
            (existing.result_json::jsonb ->> 'failureCount')::integer, 0
          ) + 1,
          'circuitOpen', false,
          'classification', 'transient',
          'code', 'lease_expired_unknown'
        ), $1
        FROM jobs
        JOIN attempts ON attempts.attempt_id = jobs.attempt_id
        LEFT JOIN idempotency_records AS existing
          ON existing.scope = 'worker-retry'
          AND existing.idempotency_key = jobs.job_id
        WHERE jobs.kind = 'research' AND attempts.status = 'unknown'
        ON CONFLICT(scope, idempotency_key) DO UPDATE SET
          result_json = excluded.result_json,
          created_at = excluded.created_at`,
      [now],
    );
    await database.query(`UPDATE jobs SET status = 'failed'
          WHERE kind = 'qa' AND attempt_id IN (
            SELECT attempt_id FROM attempts WHERE status = 'unknown'
          )`);
    await database.query(`UPDATE jobs SET status = 'retry-wait', lease_owner = NULL,
          lease_expires_at = NULL WHERE kind = 'research' AND attempt_id IN (
            SELECT attempt_id FROM attempts WHERE status = 'unknown'
          )`);
    return rows.map((row) => row.attempt_id);
  });
}
