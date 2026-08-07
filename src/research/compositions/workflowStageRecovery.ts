import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { z } from "zod";
import { EventIdSchema, RunIdSchema } from "../domain/ids";
import { appendRunEvent } from "../server/persistence/sqlite/runRepository";

const StageRecoveryRowSchema = z.object({
  failure_count: z.number().int().nonnegative(),
  next_retry_at: z.string(),
  exhausted: z.number().int().min(0).max(1),
});

const MAX_STAGE_FAILURES = 4;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 300_000] as const;

export type StageRecoveryState = "ready" | "waiting" | "exhausted";

export function isRecoverableWorkflowFailure(reason: string): boolean {
  return !/(?:auth|rights|policy_violation|origin_untrusted|link_untrusted|symbol_unsupported|identity_missing|sec_(?:primary_filing|10k)_missing|workflow_version_superseded)/iu.test(
    reason,
  );
}

export function stageRecoveryState(
  databasePath: string,
  runId: string,
  stage: string,
  now: string,
): StageRecoveryState {
  const database = new Database(databasePath, { readonly: true });
  try {
    const parsed = StageRecoveryRowSchema.safeParse(
      database
        .prepare(`SELECT failure_count, next_retry_at, exhausted
          FROM run_stage_recoveries WHERE run_id = ? AND stage = ?`)
        .get(runId, stage),
    );
    if (!parsed.success) return "ready";
    if (parsed.data.exhausted === 1) return "exhausted";
    return parsed.data.next_retry_at <= now ? "ready" : "waiting";
  } finally {
    database.close();
  }
}

export function scheduleStageRecovery(input: {
  readonly databasePath: string;
  readonly runId: string;
  readonly stage: string;
  readonly reason: string;
  readonly now: string;
}): "scheduled" | "exhausted" {
  const database = new Database(input.databasePath);
  try {
    return database.transaction(() => {
      const existing = StageRecoveryRowSchema.safeParse(
        database
          .prepare(`SELECT failure_count, next_retry_at, exhausted
            FROM run_stage_recoveries WHERE run_id = ? AND stage = ?`)
          .get(input.runId, input.stage),
      );
      const failureCount =
        (existing.success ? existing.data.failure_count : 0) + 1;
      const exhausted = failureCount >= MAX_STAGE_FAILURES;
      const delay =
        RETRY_DELAYS_MS[
          Math.min(failureCount - 1, RETRY_DELAYS_MS.length - 1)
        ] ?? 300_000;
      const nextRetryAt = new Date(Date.parse(input.now) + delay).toISOString();
      database
        .prepare(`INSERT INTO run_stage_recoveries(
          run_id, stage, failure_count, last_code, next_retry_at, exhausted,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, stage) DO UPDATE SET
          failure_count = excluded.failure_count,
          last_code = excluded.last_code,
          next_retry_at = excluded.next_retry_at,
          exhausted = excluded.exhausted,
          updated_at = excluded.updated_at`)
        .run(
          input.runId,
          input.stage,
          failureCount,
          input.reason,
          nextRetryAt,
          exhausted ? 1 : 0,
          input.now,
        );
      if (!exhausted)
        appendRunEvent(database, {
          runId: RunIdSchema.parse(input.runId),
          event: {
            eventId: EventIdSchema.parse(randomUUID()),
            type: "runtime_status",
            stateId: "retrying",
            occurredAt: input.now,
            payload: {
              code: `${input.stage}:automatic_recovery`,
              attempt: failureCount,
              nextRetryAt,
              summary: {
                en: "The completed research stages were preserved. The affected stage will resume automatically.",
                ko: "완료된 조사 단계는 보존했습니다. 문제가 생긴 단계만 자동으로 다시 진행합니다.",
              },
            },
          },
        });
      return exhausted ? "exhausted" : "scheduled";
    })();
  } finally {
    database.close();
  }
}

export function clearStageRecovery(
  databasePath: string,
  runId: string,
  stage: string,
): void {
  const database = new Database(databasePath);
  try {
    database
      .prepare(
        "DELETE FROM run_stage_recoveries WHERE run_id = ? AND stage = ?",
      )
      .run(runId, stage);
  } finally {
    database.close();
  }
}
