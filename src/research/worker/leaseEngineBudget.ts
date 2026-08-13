import type Database from "better-sqlite3";
import { z } from "zod";
import { CALL_BUDGET_POLICY } from "../domain/callBudgetContracts";
import { EventIdSchema, RunIdSchema } from "../domain/ids";
import { transitionRun } from "../server/persistence/sqlite/runRepository";
import type { ClaimedJob, ReserveInput } from "./leaseEngineSqliteTypes";

const BudgetRowSchema = z.object({
  run_id: RunIdSchema,
  status: z.literal("running"),
  version: z.number().int().nonnegative(),
  remaining_base_calls: z.number().int().nonnegative(),
  requested_optional_calls: z.number().int().nonnegative(),
  requested_replacement_calls: z.number().int().nonnegative(),
  burned: z.number().int().nonnegative(),
  replacements: z.number().int().nonnegative(),
  logical_attempts: z.number().int().nonnegative(),
});

function terminalize(
  database: Database.Database,
  input: ReserveInput,
  row: z.infer<typeof BudgetRowSchema>,
  code = "physical_launch_budget_exhausted",
): false {
  const required =
    row.burned +
    row.remaining_base_calls +
    row.requested_optional_calls +
    row.requested_replacement_calls;
  transitionRun(database, {
    runId: input.claim.runId,
    fromStatus: "running",
    toStatus: "incomplete",
    expectedVersion: row.version,
    nextJobs: [],
    event: {
      eventId: EventIdSchema.parse(input.eventId),
      type: "run_incomplete",
      stateId: "incomplete",
      occurredAt: input.now,
      payload: {
        code,
        maximum: CALL_BUDGET_POLICY.maxPhysicalLaunches,
        required,
      },
    },
  });
  database
    .prepare(`UPDATE jobs SET status = 'failed', lease_owner = NULL,
      lease_expires_at = NULL WHERE run_id = ?
      AND status NOT IN ('cancelled', 'succeeded', 'failed')`)
    .run(input.claim.runId);
  database
    .prepare(`INSERT INTO run_public_limitations(
      run_id, code, payload_json, created_at
    ) VALUES (?, ?, json_object(
      'maximum', ?, 'required', ?
    ), ?)`)
    .run(
      input.claim.runId,
      code,
      CALL_BUDGET_POLICY.maxPhysicalLaunches,
      required,
      input.now,
    );
  return false;
}

function budgetColumn(claim: ClaimedJob): string | undefined {
  // A transient provider/process retry burns a physical launch ordinal, but
  // it is not a model-output rewrite and must not consume rewrite capacity.
  if (claim.retryClassification === "transient") return undefined;
  if (claim.priorAttemptId !== undefined) return "requested_replacement_calls";
  return claim.logicalKey.startsWith("followup:")
    ? "requested_optional_calls"
    : "remaining_base_calls";
}

export function reserveWithinRunBudget(
  database: Database.Database,
  input: ReserveInput,
): boolean {
  const row = BudgetRowSchema.parse(
    database
      .prepare(`SELECT runs.run_id, runs.status, runs.version,
        runs.remaining_base_calls, runs.requested_optional_calls,
        runs.requested_replacement_calls,
        (SELECT COUNT(*) FROM research_call_ordinals
          WHERE run_id = runs.run_id) AS burned,
        (SELECT COUNT(*) FROM attempts
          WHERE run_id = runs.run_id
          AND replacement_of_attempt_id IS NOT NULL) AS replacements,
        (SELECT COUNT(*) FROM attempts
          WHERE run_id = runs.run_id
          AND logical_artifact_key = ?) AS logical_attempts
      FROM runs WHERE runs.run_id = ?`)
      .get(input.claim.logicalKey, input.claim.runId),
  );
  const required =
    row.burned +
    row.remaining_base_calls +
    row.requested_optional_calls +
    row.requested_replacement_calls;
  if (
    row.remaining_base_calls > CALL_BUDGET_POLICY.mandatoryFirstAttempts ||
    row.requested_optional_calls > CALL_BUDGET_POLICY.maxOptionalFollowups ||
    row.requested_replacement_calls > CALL_BUDGET_POLICY.maxRequiredReplacements
  )
    return terminalize(database, input, row);
  if (
    input.claim.priorAttemptId !== undefined &&
    input.claim.retryClassification !== "transient"
  ) {
    if (
      row.logical_attempts >= CALL_BUDGET_POLICY.maxAttemptsPerLogicalArtifact
    )
      return terminalize(
        database,
        input,
        row,
        "logical_artifact_replacement_exhausted",
      );
    if (row.replacements >= CALL_BUDGET_POLICY.maxRequiredReplacements)
      return terminalize(
        database,
        input,
        row,
        "research_replacement_budget_exhausted",
      );
  }
  if (required > CALL_BUDGET_POLICY.maxPhysicalLaunches)
    return terminalize(database, input, row);
  const column = budgetColumn(input.claim);
  if (column === undefined) return true;
  const changed = database
    .prepare(`UPDATE runs SET ${column} = ${column} - 1
      WHERE run_id = ? AND ${column} > 0`)
    .run(input.claim.runId).changes;
  return changed === 1 ? true : terminalize(database, input, row);
}
