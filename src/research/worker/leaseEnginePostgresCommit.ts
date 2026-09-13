import { randomUUID } from "node:crypto";
import { z } from "zod";
import { EventIdSchema } from "../domain/ids";
import { cancellationPublicEvent } from "../server/persistence/postgres/cancellationPublicEvent";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import {
  appendRunEvent,
  transitionRun,
} from "../server/persistence/postgres/runRepository";
import { serializeSafeJson } from "../server/persistence/postgres/safeJson";
import type { CommitInput } from "./leaseEnginePostgresTypes";

const SequenceRowSchema = z.object({
  last_event_seq: z.coerce.number().int().positive(),
});
const ExhaustedRunSchema = z.object({
  version: z.coerce.number().int().nonnegative(),
  remaining: z.coerce.number().int().nonnegative(),
  failed: z.coerce.number().int().nonnegative(),
  permanent: z.coerce.number().int().nonnegative(),
});

async function commitRequestedCancellation(
  database: ResearchDatabase,
  input: CommitInput,
): Promise<boolean> {
  const cancelled = (
    await database.query(
      `UPDATE jobs SET status = 'cancelled', lease_owner = NULL,
      lease_expires_at = NULL, result_artifact_id = NULL
      WHERE job_id = $1 AND attempt_id = $2
        AND status = 'cancel-requested' AND lease_owner = $3
        AND lease_token = $4`,
      [
        { ...input.claim, ...input }.jobId,
        { ...input.claim, ...input }.attemptId,
        { ...input.claim, ...input }.ownerId,
        { ...input.claim, ...input }.leaseToken,
      ],
    )
  ).rowCount;
  if (cancelled !== 1) return false;
  await database.query(
    `UPDATE attempts SET status = 'cancelled', outcome = 'cancelled'
      WHERE attempt_id = $1 AND status IN ('spawn-reserved', 'running')`,
    [input.attemptId],
  );
  const remaining = (
    await database.query(
      `SELECT 1 FROM jobs WHERE run_id = $1 AND status = 'cancel-requested'
      LIMIT 1`,
      [input.claim.runId],
    )
  ).rows[0];
  if (remaining !== undefined) return true;
  const updatedValue = (
    await database.query(
      `UPDATE runs SET status = 'cancelled', version = version + 1,
      last_event_seq = last_event_seq + 1 WHERE run_id = $1 AND status = 'cancelling'
      RETURNING last_event_seq`,
      [input.claim.runId],
    )
  ).rows[0];
  if (updatedValue === undefined) return true;
  const updated = SequenceRowSchema.parse(updatedValue);
  const event = cancellationPublicEvent({
    eventId: EventIdSchema.parse(input.eventId),
    runId: input.claim.runId,
    snapshotId: input.claim.snapshotId,
    sequence: updated.last_event_seq,
    kind: "run_cancelled",
    occurredAt: input.now,
  });
  await database.query(
    `INSERT INTO run_events(run_id, sequence, event_id, event_type,
      state_id, occurred_at, payload_json) VALUES ($1, $2, $3,
      $4, $5, $6, $7)`,
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
  return true;
}

async function persistRetry(
  database: ResearchDatabase,
  input: CommitInput,
): Promise<void> {
  if (
    input.outcome.kind !== "transient" &&
    input.outcome.kind !== "repair" &&
    input.outcome.kind !== "attention"
  )
    return;
  const retryAt =
    input.outcome.kind === "attention"
      ? (input.outcome.retryAt ?? input.now)
      : input.outcome.retryAt;
  const failureCount =
    input.claim.transientFailures + (input.outcome.kind === "repair" ? 0 : 1);
  const classification =
    input.outcome.kind === "repair" ? "repair" : "transient";
  await database.query(
    `INSERT INTO idempotency_records(
      scope, idempotency_key, request_hash, result_json, created_at
    ) VALUES ('worker-retry', $1, $2, jsonb_build_object(
      'retryAt', $3::text,
      'failureCount', $4::integer,
      'circuitOpen', $5::boolean,
      'classification', $6::text,
      'code', $7::text
    ), $8)
    ON CONFLICT(scope, idempotency_key) DO UPDATE SET
      result_json = excluded.result_json, created_at = excluded.created_at`,
    [
      input.claim.jobId,
      input.claim.inputHash,
      retryAt,
      failureCount,
      "false",
      classification,
      input.outcome.code ?? "transient_failure",
      input.now,
    ],
  );
}

function runtimeState(input: CommitInput): string | undefined {
  switch (input.outcome.kind) {
    case "accepted":
    case "degraded":
      return undefined;
    case "transient":
      return "waiting";
    case "repair":
      return "invalid-model-output";
    case "attention":
      // Attention outcomes carry a durable retryAt. They are provider cool-downs,
      // not operator-blocked failures, so keep the public run in waiting state.
      return "waiting";
    case "permanent":
      return input.outcome.code.includes("auth")
        ? "blocked-external-dependency"
        : "attention-required";
    case "incomplete":
      return input.outcome.code.startsWith("report_publication_failed:")
        ? "publication-failure"
        : undefined;
  }
}

function exhaustedRunSummary(code: string): {
  readonly en: string;
  readonly ko: string;
} {
  if (code === "sec_primary_filing_missing" || code === "sec_10k_missing")
    return {
      en: "Research stopped because no usable SEC company filing was available for this security.",
      ko: "이 종목에서 분석에 사용할 수 있는 SEC 기업 공시를 찾지 못해 리서치를 중단했습니다.",
    };
  return {
    en: "Research could not be completed. Finished stages were preserved and no research credit was charged.",
    ko: "리서치를 완성하지 못했습니다. 완료된 단계는 보존되며 리서치 크레딧은 차감되지 않습니다.",
  };
}

async function terminalizeExhaustedResearchRun(
  database: ResearchDatabase,
  input: CommitInput,
): Promise<void> {
  if (input.claim.kind !== "research") return;
  const parsed = ExhaustedRunSchema.safeParse(
    (
      await database.query(
        `SELECT runs.version,
        (SELECT COUNT(*) FROM jobs WHERE run_id = runs.run_id
          AND kind = 'research'
          AND status NOT IN ('cancelled', 'succeeded', 'failed')) AS remaining,
        (SELECT COUNT(*) FROM jobs WHERE run_id = runs.run_id
          AND kind = 'research' AND status = 'failed') AS failed,
        (SELECT COUNT(*) FROM run_events WHERE run_id = runs.run_id
          AND event_type = 'attempt_committed' AND state_id = 'failed'
          AND (payload_json::jsonb ->> 'classification') <> 'incomplete')
          AS permanent
      FROM runs WHERE run_id = $1 AND status = 'running'`,
        [input.claim.runId],
      )
    ).rows[0],
  );
  if (!parsed.success) return;
  const row = parsed.data;
  if (row.remaining > 0 || row.failed === 0) return;
  const runStatus = row.permanent > 0 ? "failed" : "incomplete";
  const code =
    "code" in input.outcome ? input.outcome.code : "research_attempt_exhausted";
  await transitionRun(database, {
    runId: input.claim.runId,
    fromStatus: "running",
    toStatus: runStatus,
    expectedVersion: row.version,
    nextJobs: [],
    event: {
      eventId: EventIdSchema.parse(input.attemptId),
      type: runStatus === "failed" ? "run_failed" : "run_incomplete",
      stateId: runStatus,
      occurredAt: input.now,
      payload: { code, summary: exhaustedRunSummary(code) },
    },
  });
}

export async function commitAttempt(
  database: ResearchDatabase,
  input: CommitInput,
): Promise<boolean> {
  if (await commitRequestedCancellation(database, input)) return false;
  const qa = input.outcome.kind === "accepted" ? input.outcome.qa : undefined;
  const accepted =
    input.outcome.kind === "accepted" || input.outcome.kind === "degraded";
  const terminal =
    accepted && (input.claim.kind === "research" || qa !== undefined);
  const retry =
    (input.outcome.kind === "transient" ||
      input.outcome.kind === "repair" ||
      input.outcome.kind === "attention") &&
    input.claim.kind === "research";
  const jobStatus = retry ? "retry-wait" : terminal ? "succeeded" : "failed";
  const changed = (
    await database.query(
      `UPDATE jobs SET status = $1,
      lease_owner = NULL, lease_expires_at = NULL
      WHERE job_id = $2 AND attempt_id = $3 AND status = 'running'
        AND lease_owner = $4 AND lease_token = $5
        AND lease_expires_at > $6`,
      [
        jobStatus,
        { ...input.claim, ...input, jobStatus }.jobId,
        { ...input.claim, ...input, jobStatus }.attemptId,
        { ...input.claim, ...input, jobStatus }.ownerId,
        { ...input.claim, ...input, jobStatus }.leaseToken,
        { ...input.claim, ...input, jobStatus }.now,
      ],
    )
  ).rowCount;
  if (changed !== 1) return false;
  await database.query(
    `UPDATE attempts SET status = $1, outcome = $2
      WHERE attempt_id = $3 AND status = 'running'`,
    [
      terminal ? "succeeded" : "failed",
      terminal ? "accepted" : "failed",
      input.attemptId,
    ],
  );
  if (retry) await persistRetry(database, input);
  if (input.claim.kind === "qa" && qa !== undefined) {
    const evidence = (
      await database.query(
        `INSERT INTO question_runner_evidence(
        attempt_id, question_id, report_id, report_version_id,
        report_artifact_id, report_artifact_digest, input_hash, prompt_hash,
        schema_hash, binary_hash, cli_version, committed_at
      ) SELECT $1, questions.question_id, $2, $3,
        $4, $5, $6, $7,
        $8, $9, $10, $11
      FROM questions JOIN attempts USING(job_id)
      WHERE questions.question_id = $12
        AND attempts.attempt_id = $1
        AND questions.report_id = $2
        AND questions.report_version_id = $3
        AND attempts.input_hash = $6`,
        [
          { ...input, ...qa, questionId: input.claim.questionId }.attemptId,
          { ...input, ...qa, questionId: input.claim.questionId }.reportId,
          { ...input, ...qa, questionId: input.claim.questionId }
            .reportVersionId,
          { ...input, ...qa, questionId: input.claim.questionId }
            .reportArtifactId,
          { ...input, ...qa, questionId: input.claim.questionId }
            .reportArtifactDigest,
          { ...input, ...qa, questionId: input.claim.questionId }.inputHash,
          { ...input, ...qa, questionId: input.claim.questionId }.promptHash,
          { ...input, ...qa, questionId: input.claim.questionId }.schemaHash,
          { ...input, ...qa, questionId: input.claim.questionId }.binaryHash,
          { ...input, ...qa, questionId: input.claim.questionId }.cliVersion,
          { ...input, ...qa, questionId: input.claim.questionId }.now,
          input.claim.questionId,
        ],
      )
    ).rowCount;
    if (evidence !== 1)
      throw new TypeError("Q&A evidence binding was rejected");
  }
  if (input.claim.kind === "qa")
    await database.query(
      `UPDATE questions SET status = $1,
        answer_json = $2 WHERE question_id = $3`,
      [
        terminal ? "answered" : "failed",
        terminal && qa !== undefined ? serializeSafeJson(qa.answer) : null,
        input.claim.questionId,
      ],
    );
  if (input.claim.kind === "research")
    await appendRunEvent(database, {
      runId: input.claim.runId,
      event: {
        eventId: EventIdSchema.parse(input.eventId),
        type: "attempt_committed",
        stateId: jobStatus,
        occurredAt: input.now,
        jobId: input.claim.jobId,
        attemptId: input.attemptId,
        payload: {
          classification: input.outcome.kind,
          ...("code" in input.outcome ? { code: input.outcome.code } : {}),
          ...("diagnostics" in input.outcome &&
          input.outcome.diagnostics !== undefined
            ? { process: input.outcome.diagnostics }
            : {}),
          ...("readiness" in input.outcome &&
          input.outcome.readiness !== undefined
            ? { readiness: input.outcome.readiness }
            : {}),
          ...("runner" in input.outcome && input.outcome.runner !== undefined
            ? { runner: input.outcome.runner }
            : {}),
        },
      },
    });
  const state = runtimeState(input);
  if (input.claim.kind === "research" && state !== undefined)
    await appendRunEvent(database, {
      runId: input.claim.runId,
      event: {
        eventId: EventIdSchema.parse(randomUUID()),
        type: "runtime_status",
        stateId: state,
        occurredAt: input.now,
        jobId: input.claim.jobId,
        attemptId: input.attemptId,
        payload: {},
      },
    });
  await terminalizeExhaustedResearchRun(database, input);
  return true;
}
