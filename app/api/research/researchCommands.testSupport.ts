import Database from "better-sqlite3";
import { z } from "zod";
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

export function setRunStatus(
  harness: ApiHarness,
  runId: string,
  status: "failed" | "incomplete" | "completed",
): void {
  const database = new Database(harness.databasePath);
  try {
    database
      .prepare("UPDATE runs SET status = ? WHERE run_id = ?")
      .run(status, runId);
  } finally {
    database.close();
  }
}

export function setInitialResearchJobStatus(
  harness: ApiHarness,
  runId: string,
  status: "retry-wait" | "failed" | "succeeded",
): void {
  const database = new Database(harness.databasePath);
  try {
    database
      .prepare(`UPDATE jobs SET status = ?
        WHERE run_id = ? AND kind = 'research'
          AND logical_key = 'collection:initial'`)
      .run(status, runId);
  } finally {
    database.close();
  }
}

export function setInitialResearchJobRetry(
  harness: ApiHarness,
  runId: string,
  input: {
    readonly retryAt: string;
    readonly failureCount: number;
    readonly circuitOpen: boolean;
  },
): void {
  const database = new Database(harness.databasePath);
  try {
    database
      .prepare(`INSERT INTO idempotency_records(scope, idempotency_key,
        request_hash, result_json, created_at)
        SELECT 'worker-retry', job_id, input_hash,
          json_object('retryAt', @retryAt, 'failureCount', @failureCount,
            'circuitOpen', json(@circuitOpen),
            'classification', 'transient', 'code', 'codex_process_failed'),
          @retryAt
        FROM jobs WHERE run_id = @runId AND kind = 'research'
          AND logical_key = 'collection:initial'
        ON CONFLICT(scope, idempotency_key) DO UPDATE SET
          result_json = excluded.result_json,
          created_at = excluded.created_at`)
      .run({
        runId,
        retryAt: input.retryAt,
        failureCount: input.failureCount,
        circuitOpen: input.circuitOpen ? "true" : "false",
      });
  } finally {
    database.close();
  }
}

export function setResearchTarget(
  harness: ApiHarness,
  runId: string,
  departmentId: "market" | "company" | "financial" | "risk",
): void {
  const database = new Database(harness.databasePath);
  try {
    database
      .prepare(`UPDATE research_requests
        SET research_kind = 'department', department_id = ?
        WHERE run_id = ?`)
      .run(departmentId, runId);
  } finally {
    database.close();
  }
}

export async function publishRun(
  harness: ApiHarness,
  run: {
    readonly runId: string;
    readonly snapshotId: string;
  },
) {
  const publication = await seedPublishedReport(harness, run);
  const database = new Database(harness.databasePath);
  try {
    database
      .prepare(`UPDATE runs SET status = 'completed', report_id = ?,
        report_published_at = ? WHERE run_id = ?`)
      .run(publication.reportId, "2026-07-23T06:00:00.000Z", run.runId);
  } finally {
    database.close();
  }
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

export function failQuestion(harness: ApiHarness, questionId: string): void {
  const database = new Database(harness.databasePath);
  try {
    database
      .prepare(`UPDATE questions SET status = 'failed', answer_json = NULL
        WHERE question_id = ?`)
      .run(questionId);
    database
      .prepare(`UPDATE jobs SET status = 'failed'
        WHERE job_id = (SELECT job_id FROM questions WHERE question_id = ?)`)
      .run(questionId);
  } finally {
    database.close();
  }
}

export function databaseScalar(
  harness: ApiHarness,
  sql: string,
  ...parameters: readonly string[]
): unknown {
  const database = new Database(harness.databasePath);
  try {
    return database
      .prepare(sql)
      .pluck()
      .get(...parameters);
  } finally {
    database.close();
  }
}
