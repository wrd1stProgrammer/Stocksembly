import { z } from "zod";
import { CALL_BUDGET_POLICY } from "../domain/callBudgetContracts";
import { EventIdSchema, RunIdSchema } from "../domain/ids";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import { transitionRun } from "../server/persistence/postgres/runRepository";
import type { ClaimedJob, ReserveInput } from "./leaseEnginePostgresTypes";

const BudgetRowSchema = z.object({
  run_id: RunIdSchema,
  status: z.literal("running"),
  version: z.coerce.number().int().nonnegative(),
  remaining_base_calls: z.coerce.number().int().nonnegative(),
  requested_optional_calls: z.coerce.number().int().nonnegative(),
  requested_replacement_calls: z.coerce.number().int().nonnegative(),
  burned: z.coerce.number().int().nonnegative(),
  replacements: z.coerce.number().int().nonnegative(),
  logical_attempts: z.coerce.number().int().nonnegative(),
});

async function terminalize(
  database: ResearchDatabase,
  input: ReserveInput,
  row: z.infer<typeof BudgetRowSchema>,
  code = "physical_launch_budget_exhausted",
): Promise<false> {
  const required =
    row.burned +
    row.remaining_base_calls +
    row.requested_optional_calls +
    row.requested_replacement_calls;
  await transitionRun(database, {
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
  await database.query(
    `UPDATE jobs SET status = 'failed', lease_owner = NULL,
      lease_expires_at = NULL WHERE run_id = $1
      AND status NOT IN ('cancelled', 'succeeded', 'failed')`,
    [input.claim.runId],
  );
  await database.query(
    `INSERT INTO run_public_limitations(
      run_id, code, payload_json, created_at
    ) VALUES ($1, $2, jsonb_build_object(
      'maximum', $3::integer, 'required', $4::integer
    ), $5)
    ON CONFLICT(run_id, code) DO UPDATE SET
      payload_json = excluded.payload_json,
      created_at = excluded.created_at`,
    [
      input.claim.runId,
      code,
      CALL_BUDGET_POLICY.maxPhysicalLaunches,
      required,
      input.now,
    ],
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

export async function reserveWithinRunBudget(
  database: ResearchDatabase,
  input: ReserveInput,
): Promise<boolean> {
  const row = BudgetRowSchema.parse(
    (
      await database.query(
        `SELECT runs.run_id, runs.status, runs.version,
        runs.remaining_base_calls, runs.requested_optional_calls,
        runs.requested_replacement_calls,
        (SELECT COUNT(*) FROM research_call_ordinals
          WHERE run_id = runs.run_id) AS burned,
        (SELECT COUNT(*) FROM attempts
          WHERE run_id = runs.run_id
          AND replacement_of_attempt_id IS NOT NULL) AS replacements,
        (SELECT 1 + COUNT(*) FROM attempts
          WHERE run_id = runs.run_id
          AND replacement_of_attempt_id IS NOT NULL
          AND logical_artifact_key = $1) AS logical_attempts
      FROM runs WHERE runs.run_id = $2`,
        [input.claim.logicalKey, input.claim.runId],
      )
    ).rows[0],
  );
  if (
    row.remaining_base_calls > CALL_BUDGET_POLICY.mandatoryFirstAttempts ||
    row.requested_optional_calls > CALL_BUDGET_POLICY.maxOptionalFollowups ||
    row.requested_replacement_calls > CALL_BUDGET_POLICY.maxRequiredReplacements
  )
    return await terminalize(database, input, row);
  if (
    input.claim.priorAttemptId !== undefined &&
    input.claim.retryClassification !== "transient"
  ) {
    if (
      row.logical_attempts >= CALL_BUDGET_POLICY.maxAttemptsPerLogicalArtifact
    )
      return await terminalize(
        database,
        input,
        row,
        "logical_artifact_replacement_exhausted",
      );
    if (row.replacements >= CALL_BUDGET_POLICY.maxRequiredReplacements)
      return await terminalize(
        database,
        input,
        row,
        "research_replacement_budget_exhausted",
      );
  }
  // Transient retries burn a physical ordinal without consuming logical
  // rewrite capacity. Bound the launches that actually occurred; summing
  // those ordinals with all still-available logical capacity would count a
  // transient retry twice and can strand valid downstream work.
  if (row.burned >= CALL_BUDGET_POLICY.maxPhysicalLaunches)
    return await terminalize(database, input, row);
  const column = budgetColumn(input.claim);
  if (column === undefined) return true;
  const changed = (
    await database.query(
      `UPDATE runs SET ${column} = ${column} - 1
      WHERE run_id = $1 AND ${column} > 0`,
      [input.claim.runId],
    )
  ).rowCount;
  return changed === 1 ? true : await terminalize(database, input, row);
}
