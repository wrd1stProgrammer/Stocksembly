import { z } from "zod";
import { cancellationPublicEvent } from "../persistence/postgres/cancellationPublicEvent";
import type { ResearchDatabase } from "../persistence/postgres/database";
import { researchTransaction } from "../persistence/postgres/database";
import {
  type CancelledRun,
  CancelledRunSchema,
  type CommandIds,
  type CommandResult,
} from "./researchCommandContracts";
import {
  commandDigest,
  commitCommand,
  replayCommand,
} from "./researchCommandIdempotency";

const ParentRowSchema = z.object({
  run_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
  status: z.string(),
  version: z.number().int().nonnegative(),
  last_event_seq: z.number().int().nonnegative(),
});
const ActiveCountSchema = z.object({ count: z.number().int().nonnegative() });
const immutableStatuses = new Set([
  "completed",
  "complete-with-limitations",
  "cancelling",
  "cancelled",
  "failed",
  "incomplete",
]);

type CommandContext = {
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly now: string;
  readonly ids: CommandIds;
};

async function cancellationParent(
  database: ResearchDatabase,
  principalId: string,
  runId: string,
) {
  const value = (
    await database.query(
      `SELECT runs.run_id, runs.snapshot_id, runs.status, runs.version,
      runs.last_event_seq FROM runs JOIN research_requests USING(run_id)
      WHERE runs.run_id = $1 AND research_requests.principal_id = $2 FOR UPDATE OF runs`,
      [runId, principalId],
    )
  ).rows[0];
  return value === undefined ? undefined : ParentRowSchema.parse(value);
}

export async function cancelResearchRun(
  database: ResearchDatabase,
  runId: string,
  context: CommandContext,
): Promise<CommandResult<CancelledRun>> {
  return await researchTransaction(
    database,
    async (transaction): Promise<CommandResult<CancelledRun>> => {
      await transaction.query(
        "SELECT pg_advisory_xact_lock(hashtext('research-admission'))",
      );
      const scope = `research-cancel:${context.principalId}:${runId}`;
      const requestHash = commandDigest({ runId });
      const replay = await replayCommand(
        transaction,
        scope,
        context.idempotencyKey,
        requestHash,
      );
      if (replay.kind === "conflict") return { kind: "conflict" };
      if (replay.kind === "replayed")
        return {
          kind: "replayed",
          value: CancelledRunSchema.parse(replay.value),
        };
      const parent = await cancellationParent(
        transaction,
        context.principalId,
        runId,
      );
      if (parent === undefined) return { kind: "not_found" };
      if (immutableStatuses.has(parent.status))
        return { kind: "illegal_state" };
      const active = ActiveCountSchema.parse(
        (
          await transaction.query(
            `SELECT CAST(COUNT(*) AS integer) AS count FROM attempts
          WHERE run_id = $1 AND status IN ('spawn-reserved', 'running')`,
            [runId],
          )
        ).rows[0],
      ).count;
      const status = active === 0 ? "cancelled" : "cancelling";
      const events = [
        cancellationPublicEvent({
          eventId: context.ids.eventId,
          runId,
          snapshotId: parent.snapshot_id,
          sequence: parent.last_event_seq + 1,
          kind: "run_cancelling",
          occurredAt: context.now,
        }),
        ...(status === "cancelled"
          ? [
              cancellationPublicEvent({
                eventId: context.ids.jobId,
                runId,
                snapshotId: parent.snapshot_id,
                sequence: parent.last_event_seq + 2,
                kind: "run_cancelled",
                occurredAt: context.now,
              }),
            ]
          : []),
      ];
      const updated = (
        await transaction.query(
          `UPDATE runs SET status = $1, version = version + 1
        WHERE run_id = $2 AND version = $3 AND status = $4`,
          [status, runId, parent.version, parent.status],
        )
      ).rowCount;
      if (updated !== 1) return { kind: "illegal_state" };
      await transaction.query(
        `UPDATE jobs SET status = 'cancelled', lease_owner = NULL,
        lease_expires_at = NULL, result_artifact_id = NULL
        WHERE run_id = $1 AND status IN ('queued', 'leased', 'retry-wait')`,
        [runId],
      );
      if (active > 0)
        await transaction.query(
          `UPDATE jobs SET status = 'cancel-requested'
          WHERE run_id = $1 AND status IN ('spawn-reserved', 'running')`,
          [runId],
        );

      for (const event of events) {
        await transaction.query(
          "UPDATE runs SET last_event_seq = last_event_seq + 1 WHERE run_id = $1",
          [runId],
        );
        await transaction.query(
          `INSERT INTO run_events(
        run_id, sequence, event_id, event_type, state_id, occurred_at, payload_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
      const value = CancelledRunSchema.parse({ runId, status });
      await commitCommand(transaction, {
        scope,
        key: context.idempotencyKey,
        requestHash,
        value,
        now: context.now,
      });
      return { kind: "created", value };
    },
  );
}
