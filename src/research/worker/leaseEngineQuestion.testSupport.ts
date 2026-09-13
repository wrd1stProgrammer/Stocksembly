import type { Pool } from "pg";
import {
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import { createRun } from "../server/persistence/postgres/runRepository";
import type { WorkerClock } from "./leaseEngine";
import { hash, uuid } from "./leaseEngine.testSupport";

export type QuestionSeed = {
  readonly runId: ReturnType<typeof RunIdSchema.parse>;
  readonly snapshotId: ReturnType<typeof SnapshotIdSchema.parse>;
  readonly jobId: ReturnType<typeof JobIdSchema.parse>;
  readonly questionId: string;
};

export async function seedQuestion(
  database: Pool,
  clock: WorkerClock,
  value: number,
): Promise<QuestionSeed> {
  const base = value * 100;
  const seed = {
    runId: RunIdSchema.parse(uuid(base + 1)),
    snapshotId: SnapshotIdSchema.parse(uuid(base + 2)),
    jobId: JobIdSchema.parse(uuid(base + 3)),
    questionId: uuid(base + 8),
  };
  await createRun(database, {
    runId: seed.runId,
    snapshotId: seed.snapshotId,
    requestedAt: clock.now(),
    initialJob: {
      jobId: seed.jobId,
      kind: "qa",
      logicalKey: `question:${value}`,
      inputHash: hash(value),
      createdAt: clock.now(),
    },
    initialEvent: {
      eventId: EventIdSchema.parse(uuid(base + 4)),
      type: "question_queued",
      stateId: "queued",
      occurredAt: clock.now(),
    },
  });

  await database.query(
    `INSERT INTO artifacts(artifact_id, run_id, snapshot_id,
        content_hash, byte_length, media_type, logical_key, input_hash, created_at)
        VALUES ($1, $2, $3, $4, 2, 'application/json', $5, $6, $7)`,
    [
      uuid(base + 5),
      seed.runId,
      seed.snapshotId,
      hash(base + 5),
      `report:${value}`,
      hash(base + 6),
      clock.now(),
    ],
  );
  await database.query(
    `INSERT INTO reports(report_id, run_id, snapshot_id,
      state, created_at) VALUES ($1, $2, $3, 'published', $4)`,
    [uuid(base + 6), seed.runId, seed.snapshotId, clock.now()],
  );
  await database.query(
    `INSERT INTO report_versions(version_id, report_id, run_id,
      snapshot_id, version, artifact_id, status, published_at, public_payload_json)
      VALUES ($1, $2, $3, $4, 1, $5, 'complete', $6, '{}')`,
    [
      uuid(base + 7),
      uuid(base + 6),
      seed.runId,
      seed.snapshotId,
      uuid(base + 5),
      clock.now(),
    ],
  );
  await database.query(
    `INSERT INTO questions(question_id, report_id,
      report_version_id, run_id, snapshot_id, job_id, attempt_ordinal,
      status, question_json, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 1, 'pending', '{}', $7)`,
    [
      seed.questionId,
      uuid(base + 6),
      uuid(base + 7),
      seed.runId,
      seed.snapshotId,
      seed.jobId,
      clock.now(),
    ],
  );
  return seed;
}
