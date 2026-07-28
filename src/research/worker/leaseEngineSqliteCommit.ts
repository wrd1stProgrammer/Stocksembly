import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { EventIdSchema } from "../domain/ids";
import { cancellationPublicEvent } from "../server/persistence/sqlite/cancellationPublicEvent";
import {
  appendRunEvent,
  transitionRun,
} from "../server/persistence/sqlite/runRepository";
import { serializeSafeJson } from "../server/persistence/sqlite/safeJson";
import type { CommitInput } from "./leaseEngineSqliteTypes";

const SequenceRowSchema = z.object({
  last_event_seq: z.number().int().positive(),
});
const ExhaustedRunSchema = z.object({
  version: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  permanent: z.number().int().nonnegative(),
});

function commitRequestedCancellation(
  database: Database.Database,
  input: CommitInput,
): boolean {
  const cancelled = database
    .prepare(`UPDATE jobs SET status = 'cancelled', lease_owner = NULL,
      lease_expires_at = NULL, result_artifact_id = NULL
      WHERE job_id = @jobId AND attempt_id = @attemptId
        AND status = 'cancel-requested' AND lease_owner = @ownerId
        AND lease_token = @leaseToken`)
    .run({ ...input.claim, ...input }).changes;
  if (cancelled !== 1) return false;
  database
    .prepare(`UPDATE attempts SET status = 'cancelled', outcome = 'cancelled'
      WHERE attempt_id = ? AND status IN ('spawn-reserved', 'running')`)
    .run(input.attemptId);
  const remaining = database
    .prepare(`SELECT 1 FROM jobs WHERE run_id = ? AND status = 'cancel-requested'
      LIMIT 1`)
    .get(input.claim.runId);
  if (remaining !== undefined) return true;
  const updatedValue = database
    .prepare(`UPDATE runs SET status = 'cancelled', version = version + 1,
      last_event_seq = last_event_seq + 1 WHERE run_id = ? AND status = 'cancelling'
      RETURNING last_event_seq`)
    .get(input.claim.runId);
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
  database
    .prepare(`INSERT INTO run_events(run_id, sequence, event_id, event_type,
      state_id, occurred_at, payload_json) VALUES (@runId, @sequence, @eventId,
      @kind, @stateId, @occurredAt, @payloadJson)`)
    .run(event);
  return true;
}

function persistRetry(database: Database.Database, input: CommitInput): void {
  if (
    input.outcome.kind !== "transient" &&
    input.outcome.kind !== "repair" &&
    input.outcome.kind !== "attention"
  )
    return;
  const retryAt =
    input.outcome.kind === "attention" ? input.now : input.outcome.retryAt;
  const failureCount =
    input.claim.transientFailures + (input.outcome.kind === "repair" ? 0 : 1);
  const classification =
    input.outcome.kind === "repair" ? "repair" : "transient";
  database
    .prepare(`INSERT INTO idempotency_records(
      scope, idempotency_key, request_hash, result_json, created_at
    ) VALUES ('worker-retry', @jobId, @inputHash, json_object(
      'retryAt', @retryAt,
      'failureCount', @failureCount,
      'circuitOpen', json(@circuitOpen),
      'classification', @classification,
      'code', @code
    ), @now)
    ON CONFLICT(scope, idempotency_key) DO UPDATE SET
      result_json = excluded.result_json, created_at = excluded.created_at`)
    .run({
      jobId: input.claim.jobId,
      inputHash: input.claim.inputHash,
      retryAt,
      failureCount,
      circuitOpen: input.outcome.kind === "attention" ? "true" : "false",
      classification,
      code: input.outcome.code ?? "transient_failure",
      now: input.now,
    });
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
      return "blocked-external-dependency";
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
  if (code === "specialist_citation_invalid_after_retry")
    return {
      en: "Research stopped because one specialist cited unavailable evidence again after a corrective retry.",
      ko: "한 전문 에이전트가 교정 재시도 후에도 제공되지 않은 근거를 다시 인용해 리서치를 중단했습니다.",
    };
  if (code === "specialist_memo_missing")
    return {
      en: "Research stopped because a required specialist memo could not be completed after its retry.",
      ko: "필수 전문 에이전트 메모가 재시도 후에도 완료되지 않아 리서치를 중단했습니다.",
    };
  if (code === "chair_synthesis_output_invalid_after_retry")
    return {
      en: "The final chair synthesis did not pass its output validation after two attempts.",
      ko: "최종 의장 종합 결과가 두 번의 시도 후에도 출력 검증을 통과하지 못했습니다.",
    };
  return {
    en: "Research stopped after the available attempt was exhausted.",
    ko: "허용된 실행 재시도를 소진해 리서치를 중단했습니다.",
  };
}

function terminalizeExhaustedResearchRun(
  database: Database.Database,
  input: CommitInput,
): void {
  if (input.claim.kind !== "research") return;
  const parsed = ExhaustedRunSchema.safeParse(
    database
      .prepare(`SELECT runs.version,
        (SELECT COUNT(*) FROM jobs WHERE run_id = runs.run_id
          AND kind = 'research'
          AND status NOT IN ('cancelled', 'succeeded', 'failed')) AS remaining,
        (SELECT COUNT(*) FROM jobs WHERE run_id = runs.run_id
          AND kind = 'research' AND status = 'failed') AS failed,
        (SELECT COUNT(*) FROM run_events WHERE run_id = runs.run_id
          AND event_type = 'attempt_committed' AND state_id = 'failed'
          AND json_extract(payload_json, '$.classification') <> 'incomplete')
          AS permanent
      FROM runs WHERE run_id = ? AND status = 'running'`)
      .get(input.claim.runId),
  );
  if (!parsed.success) return;
  const row = parsed.data;
  if (row.remaining > 0 || row.failed === 0) return;
  const runStatus = row.permanent > 0 ? "failed" : "incomplete";
  const code =
    "code" in input.outcome ? input.outcome.code : "research_attempt_exhausted";
  transitionRun(database, {
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

export function commitAttempt(
  database: Database.Database,
  input: CommitInput,
): boolean {
  if (commitRequestedCancellation(database, input)) return false;
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
  const changed = database
    .prepare(`UPDATE jobs SET status = @jobStatus,
      lease_owner = NULL, lease_expires_at = NULL
      WHERE job_id = @jobId AND attempt_id = @attemptId AND status = 'running'
        AND lease_owner = @ownerId AND lease_token = @leaseToken
        AND lease_expires_at > @now`)
    .run({ ...input.claim, ...input, jobStatus }).changes;
  if (changed !== 1) return false;
  database
    .prepare(`UPDATE attempts SET status = @status, outcome = @outcome
      WHERE attempt_id = @attemptId AND status = 'running'`)
    .run({
      attemptId: input.attemptId,
      status: terminal ? "succeeded" : "failed",
      outcome: terminal ? "accepted" : "failed",
    });
  if (retry) persistRetry(database, input);
  if (input.claim.kind === "qa" && qa !== undefined) {
    const evidence = database
      .prepare(`INSERT INTO question_runner_evidence(
        attempt_id, question_id, report_id, report_version_id,
        report_artifact_id, report_artifact_digest, input_hash, prompt_hash,
        schema_hash, binary_hash, cli_version, committed_at
      ) SELECT @attemptId, questions.question_id, @reportId, @reportVersionId,
        @reportArtifactId, @reportArtifactDigest, @inputHash, @promptHash,
        @schemaHash, @binaryHash, @cliVersion, @now
      FROM questions JOIN attempts USING(job_id)
      WHERE questions.question_id = @questionId
        AND attempts.attempt_id = @attemptId
        AND questions.report_id = @reportId
        AND questions.report_version_id = @reportVersionId
        AND attempts.input_hash = @inputHash`)
      .run({ ...input, ...qa, questionId: input.claim.questionId }).changes;
    if (evidence !== 1)
      throw new TypeError("Q&A evidence binding was rejected");
  }
  if (input.claim.kind === "qa")
    database
      .prepare(`UPDATE questions SET status = @status,
        answer_json = @answer WHERE question_id = @questionId`)
      .run({
        questionId: input.claim.questionId,
        status: terminal ? "answered" : "failed",
        answer:
          terminal && qa !== undefined ? serializeSafeJson(qa.answer) : null,
      });
  if (input.claim.kind === "research")
    appendRunEvent(database, {
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
        },
      },
    });
  const state = runtimeState(input);
  if (input.claim.kind === "research" && state !== undefined)
    appendRunEvent(database, {
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
  terminalizeExhaustedResearchRun(database, input);
  return true;
}
