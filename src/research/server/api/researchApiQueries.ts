import type Database from "better-sqlite3";
import { RunIdSchema } from "../../domain/ids";
import { WORKFLOW_PUBLIC_EVENT_KINDS } from "../../workflow/publicEventsContracts";
import { parseSafeJson } from "../persistence/sqlite/safeJson";
import type {
  PublicReport,
  PublicResearchEvent,
  PublicRun,
  RunCursor,
} from "./researchApiContracts";
import { PublicRunSchema } from "./researchApiContracts";
import {
  EventPayloadSchema,
  EventRowSchema,
  ReportRowSchema,
  RunRowSchema,
} from "./researchApiRows";

const publicEventKinds = new Set<string>(WORKFLOW_PUBLIC_EVENT_KINDS);

function publicRun(input: unknown): PublicRun {
  const row = RunRowSchema.parse(input);
  return PublicRunSchema.parse({
    runId: row.run_id,
    snapshotId: row.snapshot_id,
    symbol: row.symbol,
    locale: row.locale,
    researchTarget:
      row.research_kind === "department" && row.department_id !== null
        ? { kind: "department", departmentId: row.department_id }
        : { kind: "committee" },
    status: row.status,
    lastEventSeq: row.last_event_seq,
    createdAt: row.created_at,
    ...(row.report_id === null ? {} : { reportId: row.report_id }),
  });
}

export function listPublicRuns(
  database: Database.Database,
  principalId: string,
  limit: number,
  cursor?: RunCursor,
): readonly PublicRun[] {
  const values = database
    .prepare(`SELECT runs.run_id, runs.snapshot_id,
    research_requests.symbol, research_requests.locale,
    research_requests.research_kind, research_requests.department_id,
    runs.status,
    runs.last_event_seq, runs.created_at, runs.report_id FROM runs
    JOIN research_requests USING(run_id)
    WHERE research_requests.principal_id = @principalId
      AND (@cursorCreatedAt IS NULL OR runs.created_at < @cursorCreatedAt
        OR (runs.created_at = @cursorCreatedAt AND runs.run_id < @cursorRunId))
    ORDER BY runs.created_at DESC, runs.run_id DESC LIMIT @limit`)
    .all({
      principalId,
      cursorCreatedAt: cursor?.createdAt ?? null,
      cursorRunId: cursor?.runId ?? null,
      limit,
    });
  return values.map(publicRun);
}

export function findPublicRun(
  database: Database.Database,
  principalId: string,
  runId: string,
): PublicRun | undefined {
  const value = database
    .prepare(`SELECT runs.run_id, runs.snapshot_id,
    research_requests.symbol, research_requests.locale,
    research_requests.research_kind, research_requests.department_id,
    runs.status,
    runs.last_event_seq, runs.created_at, runs.report_id FROM runs
    JOIN research_requests USING(run_id)
    WHERE runs.run_id = ? AND research_requests.principal_id = ?`)
    .get(RunIdSchema.parse(runId), principalId);
  return value === undefined ? undefined : publicRun(value);
}

export function listPublicEvents(
  database: Database.Database,
  principalId: string,
  runId: string,
): readonly PublicResearchEvent[] | undefined {
  if (findPublicRun(database, principalId, runId) === undefined)
    return undefined;
  return database
    .prepare(`SELECT sequence, event_type, state_id,
    occurred_at, payload_json FROM run_events
    WHERE run_id = ? ORDER BY sequence`)
    .all(runId)
    .flatMap((value) => {
      const row = EventRowSchema.parse(value);
      if (!publicEventKinds.has(row.event_type)) return [];
      const payload = EventPayloadSchema.parse(parseSafeJson(row.payload_json));
      return [
        {
          sequence: row.sequence,
          kind: row.event_type,
          occurredAt: row.occurred_at,
          stateId: row.state_id,
          ...(payload.summary === undefined
            ? {}
            : { summary: payload.summary }),
          ...(payload.actorId === undefined
            ? {}
            : { actorId: payload.actorId }),
          ...(payload.artifactId === undefined
            ? {}
            : { artifactId: payload.artifactId }),
          ...(payload.logicalArtifactId === undefined
            ? {}
            : { logicalArtifactId: payload.logicalArtifactId }),
          ...(payload.reportId === undefined
            ? {}
            : { reportId: payload.reportId }),
          ...(payload.reportVersionId === undefined
            ? {}
            : { reportVersionId: payload.reportVersionId }),
          participantIds: payload.participantIds,
          claimIds: payload.claimIds,
          sourceIds: payload.sourceIds,
          limitationIds: payload.limitationIds,
        },
      ];
    });
}

export function findPublicReport(
  database: Database.Database,
  principalId: string,
  reportId: string,
): PublicReport | undefined {
  const value = database
    .prepare(`SELECT reports.report_id,
    report_versions.run_id, report_versions.snapshot_id,
    report_versions.version_id, report_versions.version,
    report_versions.artifact_id, artifacts.content_hash AS artifact_digest,
    report_versions.status, report_versions.published_at,
    report_versions.public_payload_json FROM reports
    JOIN research_requests ON research_requests.run_id = reports.run_id
    JOIN report_versions ON report_versions.report_id = reports.report_id
    JOIN artifacts ON artifacts.artifact_id = report_versions.artifact_id
    WHERE reports.report_id = ? AND reports.state = 'published'
      AND research_requests.principal_id = ?
    ORDER BY report_versions.version DESC LIMIT 1`)
    .get(reportId, principalId);
  if (value === undefined) return undefined;
  const row = ReportRowSchema.parse(value);
  return {
    reportId: row.report_id,
    artifactId: row.artifact_id,
    artifactDigest: row.artifact_digest,
    runId: row.run_id,
    snapshotId: row.snapshot_id,
    versionId: row.version_id,
    version: row.version,
    status: row.status,
    publishedAt: row.published_at,
    payload: parseSafeJson(row.public_payload_json),
  };
}
