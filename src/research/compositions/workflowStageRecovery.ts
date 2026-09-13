import { z } from "zod";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import { withResearchTransaction } from "../server/persistence/postgres/database";
import {
  EMPTY_RESEARCH_QUALITY_METRICS,
  persistResearchQualityObservation,
} from "../server/persistence/postgres/researchQualityObservations";

const StageRecoveryRowSchema = z.object({
  failure_count: z.number().int().nonnegative(),
  next_retry_at: z.string(),
  exhausted: z.number().int().min(0).max(1),
});

const MAX_STAGE_FAILURES = 4;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 300_000] as const;

export type StageRecoveryState = "ready" | "waiting" | "exhausted";
export type WorkflowFailureDisposition =
  | "item_omitted"
  | "quality_degraded"
  | "run_failed"
  | "retry"
  | "terminalize";

const CONTENT_TERMINAL_FAILURES = new Set([
  "issuer_identity_unresolved",
  "whole_envelope_integrity_failure",
  "no_grounded_core_answer",
]);

export function workflowFailureDisposition(
  reason: string,
): WorkflowFailureDisposition {
  if (CONTENT_TERMINAL_FAILURES.has(reason)) return "run_failed";
  if (
    reason === "scenario_invalid" ||
    reason.startsWith("quality_failed:item_")
  )
    return "item_omitted";
  if (
    reason.startsWith("editorial_v2_invalid:style_only") ||
    reason.startsWith("quality_failed:local_")
  )
    return "quality_degraded";
  return isRecoverableWorkflowFailure(reason) ? "retry" : "terminalize";
}

export function isRecoverableWorkflowFailure(reason: string): boolean {
  return !/(?:auth|rights|policy_violation|origin_untrusted|link_untrusted|symbol_unsupported|identity_missing|sec_(?:primary_filing|10k)_missing|workflow_version_superseded|content_mismatch|lineage_mismatch|fence_mismatch|sections_incomplete|retention_mismatch|claim_invented|scenario_invalid|role_set_incomplete|semantic_chair_or_prompt_invalid|team_view_set_incomplete|replacement_exhausted)/iu.test(
    reason,
  );
}

export async function stageRecoveryState(
  database: ResearchDatabase,
  runId: string,
  stage: string,
  now: string,
): Promise<StageRecoveryState> {
  const parsed = StageRecoveryRowSchema.safeParse(
    (
      await database.query(
        `SELECT failure_count, next_retry_at, exhausted
          FROM run_stage_recoveries WHERE run_id = $1 AND stage = $2`,
        [runId, stage],
      )
    ).rows[0],
  );
  if (!parsed.success) return "ready";
  if (parsed.data.exhausted === 1) return "exhausted";
  return parsed.data.next_retry_at <= now ? "ready" : "waiting";
}

export async function scheduleStageRecovery(input: {
  readonly database: ResearchDatabase;
  readonly runId: string;
  readonly stage: string;
  readonly reason: string;
  readonly now: string;
}): Promise<"scheduled" | "exhausted"> {
  const database = input.database;
  return await withResearchTransaction(database, async (transaction) => {
    const existing = StageRecoveryRowSchema.safeParse(
      (
        await transaction.query(
          `SELECT failure_count, next_retry_at, exhausted
            FROM run_stage_recoveries WHERE run_id = $1 AND stage = $2`,
          [input.runId, input.stage],
        )
      ).rows[0],
    );
    const failureCount =
      (existing.success ? existing.data.failure_count : 0) + 1;
    const exhausted = failureCount >= MAX_STAGE_FAILURES;
    const delay =
      RETRY_DELAYS_MS[Math.min(failureCount - 1, RETRY_DELAYS_MS.length - 1)] ??
      300_000;
    const nextRetryAt = new Date(Date.parse(input.now) + delay).toISOString();
    await transaction.query(
      `INSERT INTO run_stage_recoveries(
          run_id, stage, failure_count, last_code, next_retry_at, exhausted,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT(run_id, stage) DO UPDATE SET
          failure_count = excluded.failure_count,
          last_code = excluded.last_code,
          next_retry_at = excluded.next_retry_at,
          exhausted = excluded.exhausted,
          updated_at = excluded.updated_at`,
      [
        input.runId,
        input.stage,
        failureCount,
        input.reason,
        nextRetryAt,
        exhausted ? 1 : 0,
        input.now,
      ],
    );
    return exhausted ? "exhausted" : "scheduled";
  });
}

export async function persistWorkflowQualityOutcome(input: {
  readonly database: ResearchDatabase;
  readonly runId: string;
  readonly outcome: "item_omitted" | "quality_degraded" | "run_failed";
  readonly reason: string;
  readonly observedAt: string;
}): Promise<void> {
  const database = input.database;
  await persistResearchQualityObservation(database, {
    runId: input.runId,
    workflowVersion: "workflow-v3",
    reportVersion: "unpublished",
    outcome: input.outcome,
    observedAt: input.observedAt,
    metrics: {
      ...EMPTY_RESEARCH_QUALITY_METRICS,
      omittedClaims:
        input.outcome === "item_omitted" &&
        !/(?:source|peer|scenario)/u.test(input.reason)
          ? 1
          : 0,
      omittedSources: /source/u.test(input.reason) ? 1 : 0,
      omittedPeers: /peer/u.test(input.reason) ? 1 : 0,
      omittedScenarios: /scenario/u.test(input.reason) ? 1 : 0,
    },
    reasonCodes: [input.reason],
  });
}

export async function clearStageRecovery(
  database: ResearchDatabase,
  runId: string,
  stage: string,
): Promise<void> {
  await database.query(
    "DELETE FROM run_stage_recoveries WHERE run_id = $1 AND stage = $2",
    [runId, stage],
  );
}
