import type Database from "better-sqlite3";
import { z } from "zod";
import { cancellationPublicEvent } from "../persistence/sqlite/cancellationPublicEvent";
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

function cancellationParent(
  database: Database.Database,
  principalId: string,
  runId: string,
) {
  const value = database
    .prepare(`SELECT runs.run_id, runs.snapshot_id, runs.status, runs.version,
      runs.last_event_seq FROM runs JOIN research_requests USING(run_id)
      WHERE runs.run_id = ? AND research_requests.principal_id = ?`)
    .get(runId, principalId);
  return value === undefined ? undefined : ParentRowSchema.parse(value);
}

export function cancelResearchRun(
  database: Database.Database,
  runId: string,
  context: CommandContext,
): CommandResult<CancelledRun> {
  return database
    .transaction((): CommandResult<CancelledRun> => {
      const scope = `research-cancel:${context.principalId}:${runId}`;
      const requestHash = commandDigest({ runId });
      const replay = replayCommand(
        database,
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
      const parent = cancellationParent(database, context.principalId, runId);
      if (parent === undefined) return { kind: "not_found" };
      if (immutableStatuses.has(parent.status))
        return { kind: "illegal_state" };
      const active = ActiveCountSchema.parse(
        database
          .prepare(`SELECT COUNT(*) AS count FROM attempts
          WHERE run_id = ? AND status IN ('spawn-reserved', 'running')`)
          .get(runId),
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
      const updated = database
        .prepare(`UPDATE runs SET status = ?, version = version + 1
        WHERE run_id = ? AND version = ? AND status = ?`)
        .run(status, runId, parent.version, parent.status).changes;
      if (updated !== 1) return { kind: "illegal_state" };
      database
        .prepare(`UPDATE jobs SET status = 'cancelled', lease_owner = NULL,
        lease_expires_at = NULL, result_artifact_id = NULL
        WHERE run_id = ? AND status IN ('queued', 'leased', 'retry-wait')`)
        .run(runId);
      if (active > 0)
        database
          .prepare(`UPDATE jobs SET status = 'cancel-requested'
          WHERE run_id = ? AND status IN ('spawn-reserved', 'running')`)
          .run(runId);
      const insertEvent = database.prepare(`INSERT INTO run_events(
        run_id, sequence, event_id, event_type, state_id, occurred_at, payload_json
      ) VALUES (@runId, @sequence, @eventId, @kind, @stateId, @occurredAt, @payloadJson)`);
      for (const event of events) {
        database
          .prepare(
            "UPDATE runs SET last_event_seq = last_event_seq + 1 WHERE run_id = ?",
          )
          .run(runId);
        insertEvent.run(event);
      }
      const value = CancelledRunSchema.parse({ runId, status });
      commitCommand(database, {
        scope,
        key: context.idempotencyKey,
        requestHash,
        value,
        now: context.now,
      });
      return { kind: "created", value };
    })
    .immediate();
}
