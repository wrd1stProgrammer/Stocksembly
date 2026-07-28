import type Database from "better-sqlite3";
import { z } from "zod";
import {
  type ChildRun,
  ChildRunSchema,
  type CommandIds,
  type CommandResult,
} from "./researchCommandContracts";
import {
  commandDigest,
  commitCommand,
  replayCommand,
} from "./researchCommandIdempotency";
import { insertChild, parentRow } from "./researchRunCommands";

const ReportRowSchema = z.object({
  report_id: z.string().uuid(),
  run_id: z.string().uuid(),
  state: z.literal("published"),
});
const VersionRowSchema = z.object({ version: z.number().int().positive() });

type FollowUpContext = {
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly now: string;
  readonly ids: CommandIds;
  readonly question?: string;
};

export function createResearchFollowUp(
  database: Database.Database,
  reportId: string,
  context: FollowUpContext,
): CommandResult<ChildRun> {
  return database
    .transaction((): CommandResult<ChildRun> => {
      const scope = `research-follow-up:${context.principalId}:${reportId}`;
      const requestHash = commandDigest({
        reportId,
        question: context.question ?? null,
      });
      const replay = replayCommand(
        database,
        scope,
        context.idempotencyKey,
        requestHash,
      );
      if (replay.kind === "conflict") return { kind: "conflict" };
      if (replay.kind === "replayed")
        return { kind: "replayed", value: ChildRunSchema.parse(replay.value) };
      const value = database
        .prepare(`SELECT reports.report_id, reports.run_id, reports.state
        FROM reports JOIN research_requests USING(run_id)
        WHERE reports.report_id = ? AND research_requests.principal_id = ?`)
        .get(reportId, context.principalId);
      if (value === undefined) return { kind: "not_found" };
      const report = ReportRowSchema.safeParse(value);
      if (!report.success) return { kind: "illegal_state" };
      const parent = parentRow(
        database,
        context.principalId,
        report.data.run_id,
      );
      if (
        parent === undefined ||
        (parent.status !== "completed" &&
          parent.status !== "complete-with-limitations")
      )
        return { kind: "illegal_state" };
      database
        .prepare(`INSERT INTO snapshots(snapshot_id, run_id, state, requested_at)
        VALUES (?, ?, 'collecting', ?)`)
        .run(context.ids.snapshotId, context.ids.runId, context.now);
      insertChild(database, parent, context, {
        snapshotId: context.ids.snapshotId,
        lineage: "new-snapshot-follow-up",
        priorReportId: reportId,
        question: context.question ?? parent.question,
      });
      const latest = VersionRowSchema.parse(
        database
          .prepare(`SELECT MAX(version) AS version FROM (
          SELECT version FROM report_versions WHERE report_id = ?
          UNION ALL SELECT version FROM report_follow_up_versions WHERE report_id = ?
        )`)
          .get(reportId, reportId),
      ).version;
      const version = latest + 1;
      database
        .prepare(`INSERT INTO report_follow_up_versions(
        report_id, version, child_run_id, created_at
      ) VALUES (?, ?, ?, ?)`)
        .run(reportId, version, context.ids.runId, context.now);
      const child = ChildRunSchema.parse({
        runId: context.ids.runId,
        snapshotId: context.ids.snapshotId,
        status: "queued",
        parentRunId: parent.run_id,
        lineage: "new-snapshot-follow-up",
        reportId,
        version,
      });
      commitCommand(database, {
        scope,
        key: context.idempotencyKey,
        requestHash,
        value: {
          runId: child.runId,
          snapshotId: child.snapshotId,
          status: child.status,
          parentRunId: child.parentRunId,
          lineage: child.lineage,
          reportId,
          version,
        },
        now: context.now,
      });
      return { kind: "created", value: child };
    })
    .immediate();
}
