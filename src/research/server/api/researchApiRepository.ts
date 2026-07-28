import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { CALL_BUDGET_POLICY } from "../../domain/callBudgetContracts";
import {
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../domain/ids";
import { checkRunAdmission } from "../../domain/limits";
import { applyOrderedMigrations } from "../persistence/sqlite/migrations";
import {
  parseSafeJson,
  serializeSafeJson,
} from "../persistence/sqlite/safeJson";
import type {
  CreateResearchRunCommand,
  CreateResearchRunResult,
  NormalizedResearchRequest,
  PublicReport,
  PublicResearchEvent,
  PublicRun,
  PublicRunDetail,
  ResearchIdempotencyLookup,
  RunCursor,
} from "./researchApiContracts";
import { PublicRunSchema } from "./researchApiContracts";
import {
  findPublicReport,
  findPublicRun,
  listPublicEvents,
  listPublicRuns,
} from "./researchApiQueries";
import {
  CountRowSchema,
  IdempotencyRowSchema,
  RunRowSchema,
} from "./researchApiRows";

export type ResearchApiRepositoryOptions = {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
};

function runFromRow(input: unknown): PublicRun {
  const row = RunRowSchema.parse(input);
  return PublicRunSchema.parse({
    runId: row.run_id,
    snapshotId: row.snapshot_id,
    symbol: row.symbol,
    locale: row.locale,
    status: row.status,
    lastEventSeq: row.last_event_seq,
    createdAt: row.created_at,
    ...(row.report_id === null ? {} : { reportId: row.report_id }),
  });
}

function digest(input: NormalizedResearchRequest): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function publicRunJson(run: PublicRun) {
  return {
    runId: run.runId,
    snapshotId: run.snapshotId,
    symbol: run.symbol,
    locale: run.locale,
    status: run.status,
    lastEventSeq: run.lastEventSeq,
    createdAt: run.createdAt,
    ...(run.reportId === undefined ? {} : { reportId: run.reportId }),
  };
}

export class ResearchApiRepository {
  readonly #database: Database.Database;

  constructor(options: ResearchApiRepositoryOptions) {
    this.#database = new Database(options.databasePath, { timeout: 5_000 });
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("synchronous = FULL");
    this.#database.pragma("busy_timeout = 5000");
    applyOrderedMigrations(this.#database, options.migrationsDirectory);
  }

  create(command: CreateResearchRunCommand): CreateResearchRunResult {
    const { principalId, request, ids, now } = command;
    const key = command.idempotencyKey;
    const requestHash = digest(request);
    const scope = `research-run:${principalId}`;
    return this.#database
      .transaction(() => {
        const existing = this.#database
          .prepare(`SELECT request_hash, result_json FROM idempotency_records
          WHERE scope = ? AND idempotency_key = ?`)
          .get(scope, key);
        if (existing !== undefined) {
          const row = IdempotencyRowSchema.parse(existing);
          if (row.request_hash !== requestHash)
            return { kind: "idempotency_conflict" } as const;
          return {
            kind: "replayed",
            run: PublicRunSchema.parse(parseSafeJson(row.result_json)),
          } as const;
        }
        const active = this.count(`status IN ('running', 'cancelling')
          AND EXISTS (
            SELECT 1 FROM jobs
            WHERE jobs.run_id = runs.run_id
              AND jobs.kind = 'research'
              AND jobs.status NOT IN ('cancelled', 'succeeded', 'failed')
          )`);
        const queued = this.count("status = 'queued'");
        if (checkRunAdmission(active, queued).kind !== "accepted")
          return { kind: "queue_full" } as const;
        const runId = RunIdSchema.parse(ids.runId);
        const snapshotId = SnapshotIdSchema.parse(ids.snapshotId);
        const jobId = JobIdSchema.parse(ids.jobId);
        const eventId = EventIdSchema.parse(ids.eventId);
        this.#database
          .prepare(`INSERT INTO runs(
        run_id, snapshot_id, status, last_event_seq, created_at,
        remaining_base_calls, requested_optional_calls, requested_replacement_calls
      ) VALUES (?, ?, 'queued', 1, ?, ?, ?, ?)`)
          .run(
            runId,
            snapshotId,
            now,
            CALL_BUDGET_POLICY.mandatoryFirstAttempts,
            CALL_BUDGET_POLICY.maxOptionalFollowups,
            CALL_BUDGET_POLICY.maxRequiredReplacements,
          );
        this.#database
          .prepare(`INSERT INTO snapshots(
        snapshot_id, run_id, state, requested_at
      ) VALUES (?, ?, 'collecting', ?)`)
          .run(snapshotId, runId, now);
        this.#database
          .prepare(`INSERT INTO jobs(
        job_id, run_id, snapshot_id, kind, logical_key, input_hash,
        status, created_at
      ) VALUES (?, ?, ?, 'research', 'collection:initial', ?, 'queued', ?)`)
          .run(jobId, runId, snapshotId, requestHash, now);
        this.#database
          .prepare(`INSERT INTO run_events(
        run_id, sequence, event_id, event_type, state_id, occurred_at, payload_json
      ) VALUES (?, 1, ?, 'run_created', 'run_created', ?, ?)`)
          .run(
            runId,
            eventId,
            now,
            serializeSafeJson({
              schemaVersion: "workflow-v1",
              participantIds: [],
              claimIds: [],
              sourceIds: [],
              limitationIds: [],
              summary: {
                en: `${request.symbol} research was queued.`,
                ko: `${request.symbol} 리서치가 대기열에 등록됐습니다.`,
              },
            }),
          );
        this.#database
          .prepare(`INSERT INTO research_requests(
        run_id, principal_id, symbol, question, locale, request_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(
            runId,
            principalId,
            request.symbol,
            request.question,
            request.locale,
            requestHash,
            now,
          );
        const run = runFromRow(this.runRow(principalId, runId));
        this.#database
          .prepare(`INSERT INTO idempotency_records(
        scope, idempotency_key, request_hash, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?)`)
          .run(
            scope,
            key,
            requestHash,
            serializeSafeJson(publicRunJson(run)),
            now,
          );
        return { kind: "created", run } as const;
      })
      .immediate();
  }

  lookupIdempotency(
    principalId: string,
    key: string,
    request: NormalizedResearchRequest,
  ): ResearchIdempotencyLookup {
    const value = this.#database
      .prepare(`SELECT request_hash, result_json FROM idempotency_records
        WHERE scope = ? AND idempotency_key = ?`)
      .get(`research-run:${principalId}`, key);
    if (value === undefined) return { kind: "missing" };
    const row = IdempotencyRowSchema.parse(value);
    return row.request_hash === digest(request)
      ? {
          kind: "replayed",
          run: PublicRunSchema.parse(parseSafeJson(row.result_json)),
        }
      : { kind: "conflict" };
  }

  runRow(principalId: string, runId: string): unknown {
    return this.#database
      .prepare(`SELECT runs.run_id, runs.snapshot_id,
      research_requests.symbol, research_requests.locale, runs.status,
      runs.last_event_seq, runs.created_at, runs.report_id FROM runs
      JOIN research_requests USING(run_id)
      WHERE runs.run_id = ? AND research_requests.principal_id = ?`)
      .get(runId, principalId);
  }

  findRun(principalId: string, runId: string): PublicRun | undefined {
    return findPublicRun(this.#database, principalId, runId);
  }

  listRuns(
    principalId: string,
    limit: number,
    cursor?: RunCursor,
  ): readonly PublicRun[] {
    return listPublicRuns(this.#database, principalId, limit, cursor);
  }

  events(
    principalId: string,
    runId: string,
  ): readonly PublicResearchEvent[] | undefined {
    return listPublicEvents(this.#database, principalId, runId);
  }

  detail(principalId: string, runId: string): PublicRunDetail | undefined {
    return this.#database.transaction(() => {
      const run = findPublicRun(this.#database, principalId, runId);
      if (run === undefined) return undefined;
      const events = listPublicEvents(this.#database, principalId, runId);
      return events === undefined ? undefined : { run, events };
    })();
  }

  report(principalId: string, reportId: string): PublicReport | undefined {
    return findPublicReport(this.#database, principalId, reportId);
  }

  close(): void {
    if (this.#database.open) this.#database.close();
  }

  private count(predicate: string): number {
    return CountRowSchema.parse(
      this.#database
        .prepare(`SELECT COUNT(*) AS count FROM runs WHERE ${predicate}`)
        .get(),
    ).count;
  }
}
