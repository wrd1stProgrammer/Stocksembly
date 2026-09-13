import { randomUUID } from "node:crypto";
import { z } from "zod";
import { researchTransaction } from "../../../src/research/server/persistence/postgres/database";
import { seedPublishedReport } from "./researchReportRoute.testSupport";
import {
  type ApiHarness,
  createRunRequest,
  json,
} from "./researchRoutes.testSupport";

const RunResponseSchema = z.object({
  run: z.object({
    runId: z.string().uuid(),
    snapshotId: z.string().uuid(),
    status: z.string(),
    reportId: z.string().uuid().optional(),
    version: z.number().int().optional(),
  }),
});
const QuestionResponseSchema = z.object({
  question: z.object({
    questionId: z.string().uuid(),
    attemptOrdinal: z.number().int(),
    status: z.string(),
  }),
});

export async function createRun(harness: ApiHarness, key: string) {
  const response = await harness.api.handle(createRunRequest(harness, key));
  return RunResponseSchema.parse(await json(response)).run;
}

export async function setRunStatus(
  harness: ApiHarness,
  runId: string,
  status: "failed" | "incomplete" | "completed",
): Promise<void> {
  const database = harness.database;
  await database.query("UPDATE runs SET status = $1 WHERE run_id = $2", [
    status,
    runId,
  ]);
}

export async function setInitialResearchJobStatus(
  harness: ApiHarness,
  runId: string,
  status:
    | "leased"
    | "retry-wait"
    | "failed"
    | "spawn-reserved"
    | "running"
    | "succeeded",
): Promise<void> {
  const database = harness.database;
  await database.query(
    `UPDATE jobs SET status = $1
        WHERE run_id = $2 AND kind = 'research'
          AND logical_key = 'collection:initial'`,
    [status, runId],
  );
}

export async function interruptInitialResearchJob(
  harness: ApiHarness,
  runId: string,
  status: "spawn-reserved" | "running",
): Promise<string> {
  const database = harness.database;
  const attemptId = randomUUID();
  await researchTransaction(database, async (database) => {
    await database.query(
      `INSERT INTO attempts(attempt_id, job_id, run_id, snapshot_id,
          kind, status, logical_artifact_key, input_hash, created_at)
          SELECT $1, job_id, run_id, snapshot_id, kind, $2,
            logical_key, input_hash, created_at
          FROM jobs WHERE run_id = $3 AND kind = 'research'
            AND logical_key = 'collection:initial'`,
      [attemptId, status, runId],
    );
    await database.query(
      `UPDATE jobs SET status = $1, attempt_id = $2,
          lease_owner = 'interrupted-worker', lease_token = 1,
          lease_expires_at = '2099-01-01T00:00:00.000Z'
          WHERE run_id = $3 AND kind = 'research'
            AND logical_key = 'collection:initial'`,
      [status, attemptId, runId],
    );
  });
  return attemptId;
}

export async function setInitialResearchJobRetry(
  harness: ApiHarness,
  runId: string,
  input: {
    readonly retryAt: string;
    readonly failureCount: number;
    readonly circuitOpen: boolean;
  },
): Promise<void> {
  const database = harness.database;
  await database.query(
    `INSERT INTO idempotency_records(scope, idempotency_key,
        request_hash, result_json, created_at)
        SELECT 'worker-retry', job_id, input_hash,
          jsonb_build_object('retryAt', $1::text, 'failureCount', $2::integer,
            'circuitOpen', $3::boolean,
            'classification', 'transient', 'code', 'codex_process_failed'),
          $1
        FROM jobs WHERE run_id = $4 AND kind = 'research'
          AND logical_key = 'collection:initial'
        ON CONFLICT(scope, idempotency_key) DO UPDATE SET
          result_json = excluded.result_json,
          created_at = excluded.created_at`,
    [input.retryAt, input.failureCount, input.circuitOpen, runId],
  );
}

export async function setResearchTarget(
  harness: ApiHarness,
  runId: string,
  departmentId: "market" | "company" | "financial" | "risk",
): Promise<void> {
  const database = harness.database;
  await database.query(
    `UPDATE research_requests
        SET research_kind = 'department', department_id = $1
        WHERE run_id = $2`,
    [departmentId, runId],
  );
}

export async function publishRun(
  harness: ApiHarness,
  run: {
    readonly runId: string;
    readonly snapshotId: string;
  },
) {
  const publication = await seedPublishedReport(harness, run);
  const database = harness.database;
  await database.query(
    `UPDATE runs SET status = 'completed', report_id = $1,
        report_published_at = $2 WHERE run_id = $3`,
    [publication.reportId, "2026-07-23T06:00:00.000Z", run.runId],
  );
  return publication;
}

export function commandRequest(
  harness: ApiHarness,
  path: string,
  key: string,
  body: Readonly<Record<string, unknown>> = {},
): Request {
  return harness.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
      origin: harness.allowedOrigin,
    },
    body: JSON.stringify(body),
  });
}

export async function postCommand(
  harness: ApiHarness,
  path: string,
  key: string,
  body: Readonly<Record<string, unknown>> = {},
) {
  const response = await harness.api.handle(
    commandRequest(harness, path, key, body),
  );
  return { response, body: await json(response) };
}

export async function postQuestion(
  harness: ApiHarness,
  reportId: string,
  key: string,
  body: Readonly<Record<string, unknown>>,
) {
  const result = await postCommand(
    harness,
    `/api/research/reports/${reportId}/questions`,
    key,
    body,
  );
  return {
    response: result.response,
    body: result.body,
    question: QuestionResponseSchema.safeParse(result.body).data?.question,
  };
}

export async function failQuestion(
  harness: ApiHarness,
  questionId: string,
): Promise<void> {
  const database = harness.database;
  await database.query(
    `UPDATE questions SET status = 'failed', answer_json = NULL
        WHERE question_id = $1`,
    [questionId],
  );
  await database.query(
    `UPDATE jobs SET status = 'failed'
        WHERE job_id = (SELECT job_id FROM questions WHERE question_id = $1)`,
    [questionId],
  );
}

export async function databaseScalar(
  harness: ApiHarness,
  sql: string,
  ...parameters: readonly string[]
): Promise<unknown> {
  const database = harness.database;
  {
    const result = await database.query(sql, [...parameters]);
    const value = Object.values(result.rows[0] ?? {})[0];
    return typeof value === "string" &&
      /^\d+$/.test(value) &&
      /count\(/i.test(sql)
      ? Number(value)
      : value;
  }
}
