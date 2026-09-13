import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  ActiveResearchActivity,
  ActiveResearchActivityKind,
} from "../../domain/activeResearchActivity";
import { CALL_BUDGET_POLICY } from "../../domain/callBudgetContracts";
import {
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../domain/ids";
import { checkRunAdmission } from "../../domain/limits";
import { ResearchProfileSchema } from "../../domain/researchProfile";
import {
  WORKFLOW_V1_CHAIR_ID,
  type WorkflowActorId,
  WorkflowActorIdSchema,
} from "../../domain/roleRegistry";
import type { ResearchDatabase } from "../persistence/postgres/database";
import { researchTransaction } from "../persistence/postgres/database";
import { researchQueueStatus } from "../persistence/postgres/runExecutionRepository";
import {
  parseSafeJson,
  serializeSafeJson,
} from "../persistence/postgres/safeJson";
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
  readonly database: ResearchDatabase;
};

function runFromRow(input: unknown): PublicRun {
  const row = RunRowSchema.parse(input);
  return PublicRunSchema.parse({
    runId: row.run_id,
    snapshotId: row.snapshot_id,
    symbol: row.symbol,
    ...(row.question === undefined ? {} : { question: row.question }),
    locale: row.locale,
    researchTarget:
      row.research_kind === "department" && row.department_id !== null
        ? { kind: "department", departmentId: row.department_id }
        : { kind: "committee" },
    researchProfile: ResearchProfileSchema.parse(
      parseSafeJson(row.research_profile_json),
    ),
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
    ...(run.question === undefined ? {} : { question: run.question }),
    locale: run.locale,
    researchTarget: run.researchTarget,
    researchProfile: run.researchProfile,
    status: run.status,
    lastEventSeq: run.lastEventSeq,
    createdAt: run.createdAt,
    ...(run.reportId === undefined ? {} : { reportId: run.reportId }),
  };
}

const ActiveResearchJobRowSchema = z.object({ logical_key: z.string() });

function activeJobActor(logicalKey: string): WorkflowActorId | undefined {
  if (
    logicalKey === "collection:initial" ||
    logicalKey === "semantic_audit:system" ||
    logicalKey === "structural_audit:system" ||
    logicalKey === "chair_synthesis:chair"
  )
    return WORKFLOW_V1_CHAIR_ID;
  const separator = logicalKey.indexOf(":");
  if (separator < 0) return undefined;
  const parsed = WorkflowActorIdSchema.safeParse(
    logicalKey.slice(separator + 1),
  );
  return parsed.success ? parsed.data : undefined;
}

function activeJobActivity(logicalKey: string): ActiveResearchActivityKind {
  const direct: Readonly<Record<string, ActiveResearchActivityKind>> = {
    "collection:initial": "data_collection",
    "memo:market": "macro_analysis",
    "memo:market_news": "news_analysis",
    "memo:benchmark": "market_comparison",
    "memo:company": "business_analysis",
    "memo:company_product": "product_analysis",
    "memo:company_competition": "competition_analysis",
    "memo:financial": "financial_analysis",
    "memo:valuation": "valuation_analysis",
    "memo:financial_quality": "earnings_quality_analysis",
    "memo:risk": "downside_analysis",
    "memo:risk_policy": "policy_scenario_analysis",
    "structural_audit:system": "evidence_audit",
    "semantic_audit:system": "semantic_audit",
    "chair_synthesis:chair": "chair_synthesis",
  };
  const exact = direct[logicalKey];
  if (exact !== undefined) return exact;
  if (logicalKey.startsWith("consolidation:")) return "team_synthesis";
  if (logicalKey.startsWith("challenge:")) return "challenge_review";
  if (logicalKey.startsWith("followup:")) return "followup_research";
  if (logicalKey.startsWith("response_ballot:")) return "response_review";
  return "data_collection";
}

export class ResearchApiRepository {
  readonly #database: ResearchDatabase;

  constructor(options: ResearchApiRepositoryOptions) {
    this.#database = options.database;
  }

  async create(
    command: CreateResearchRunCommand,
  ): Promise<CreateResearchRunResult> {
    const { principalId, request, ids, now } = command;
    const key = command.idempotencyKey;
    const requestHash = digest(request);
    const scope = `research-run:${principalId}`;
    return await researchTransaction(this.#database, async (transaction) => {
      await transaction.query(
        "SELECT pg_advisory_xact_lock(hashtext('research-admission'))",
      );
      const existing = (
        await transaction.query(
          `SELECT request_hash, result_json FROM idempotency_records
          WHERE scope = $1 AND idempotency_key = $2`,
          [scope, key],
        )
      ).rows[0];
      if (existing !== undefined) {
        const row = IdempotencyRowSchema.parse(existing);
        if (row.request_hash !== requestHash)
          return { kind: "idempotency_conflict" } as const;
        return {
          kind: "replayed",
          run: PublicRunSchema.parse(parseSafeJson(row.result_json)),
        } as const;
      }
      const active = await this.count(
        transaction,
        `status IN ('running', 'cancelling')
          AND EXISTS (
            SELECT 1 FROM jobs
            WHERE jobs.run_id = runs.run_id
              AND jobs.kind = 'research'
              AND jobs.status NOT IN ('cancelled', 'succeeded', 'failed')
          )`,
      );
      const queued = await this.count(transaction, "status = 'queued'");
      if (checkRunAdmission(active, queued).kind !== "accepted")
        return { kind: "queue_full" } as const;
      const runId = RunIdSchema.parse(ids.runId);
      const snapshotId = SnapshotIdSchema.parse(ids.snapshotId);
      const jobId = JobIdSchema.parse(ids.jobId);
      const eventId = EventIdSchema.parse(ids.eventId);
      await transaction.query(
        `INSERT INTO runs(
        run_id, snapshot_id, status, last_event_seq, created_at,
        remaining_base_calls, requested_optional_calls, requested_replacement_calls
      ) VALUES ($1, $2, 'queued', 1, $3, $4, $5, $6)`,
        [
          runId,
          snapshotId,
          now,
          CALL_BUDGET_POLICY.mandatoryFirstAttempts,
          CALL_BUDGET_POLICY.maxOptionalFollowups,
          CALL_BUDGET_POLICY.maxRequiredReplacements,
        ],
      );
      await transaction.query(
        `INSERT INTO snapshots(
        snapshot_id, run_id, state, requested_at
      ) VALUES ($1, $2, 'collecting', $3)`,
        [snapshotId, runId, now],
      );
      await transaction.query(
        `INSERT INTO jobs(
        job_id, run_id, snapshot_id, kind, logical_key, input_hash,
        status, created_at
      ) VALUES ($1, $2, $3, 'research', 'collection:initial', $4, 'queued', $5)`,
        [jobId, runId, snapshotId, requestHash, now],
      );
      await transaction.query(
        `INSERT INTO run_events(
        run_id, sequence, event_id, event_type, state_id, occurred_at, payload_json
      ) VALUES ($1, 1, $2, 'run_created', 'run_created', $3, $4)`,
        [
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
        ],
      );
      await transaction.query(
        `INSERT INTO research_requests(
        run_id, principal_id, symbol, question, locale, request_hash, created_at,
        research_kind, department_id, research_profile_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          runId,
          principalId,
          request.symbol,
          request.question,
          request.locale,
          requestHash,
          now,
          request.researchTarget.kind,
          request.researchTarget.kind === "department"
            ? request.researchTarget.departmentId
            : null,
          serializeSafeJson(request.researchProfile),
        ],
      );
      if (request.question.length > 0)
        await transaction.query(
          `INSERT INTO research_question_localizations(
              run_id, locale, question, created_at
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT(run_id, locale) DO NOTHING`,
          [runId, request.locale, request.question, now],
        );
      const run = runFromRow(
        await this.runRow(principalId, runId, transaction),
      );
      await transaction.query(
        `INSERT INTO idempotency_records(
        scope, idempotency_key, request_hash, result_json, created_at
      ) VALUES ($1, $2, $3, $4, $5)`,
        [scope, key, requestHash, serializeSafeJson(publicRunJson(run)), now],
      );
      return { kind: "created", run } as const;
    });
  }

  async lookupIdempotency(
    principalId: string,
    key: string,
    request: NormalizedResearchRequest,
  ): Promise<ResearchIdempotencyLookup> {
    const value = (
      await this.#database.query(
        `SELECT request_hash, result_json FROM idempotency_records
        WHERE scope = $1 AND idempotency_key = $2`,
        [`research-run:${principalId}`, key],
      )
    ).rows[0];
    if (value === undefined) return { kind: "missing" };
    const row = IdempotencyRowSchema.parse(value);
    return row.request_hash === digest(request)
      ? {
          kind: "replayed",
          run: PublicRunSchema.parse(parseSafeJson(row.result_json)),
        }
      : { kind: "conflict" };
  }

  async runRow(
    principalId: string,
    runId: string,
    database: ResearchDatabase = this.#database,
  ): Promise<unknown> {
    return (
      await database.query(
        `SELECT runs.run_id, runs.snapshot_id,
      research_requests.symbol, research_requests.question,
      research_requests.locale,
      research_requests.research_kind, research_requests.department_id,
      research_requests.research_profile_json,
      runs.status,
      runs.last_event_seq, runs.created_at, runs.report_id FROM runs
      JOIN research_requests USING(run_id)
      WHERE runs.run_id = $1 AND research_requests.principal_id = $2`,
        [runId, principalId],
      )
    ).rows[0];
  }

  async findRun(
    principalId: string,
    runId: string,
  ): Promise<PublicRun | undefined> {
    return await findPublicRun(this.#database, principalId, runId);
  }

  async listRuns(
    principalId: string,
    limit: number,
    cursor?: RunCursor,
  ): Promise<readonly PublicRun[]> {
    return await listPublicRuns(this.#database, principalId, limit, cursor);
  }

  async events(
    principalId: string,
    runId: string,
  ): Promise<readonly PublicResearchEvent[] | undefined> {
    return await listPublicEvents(this.#database, principalId, runId);
  }

  async detail(
    principalId: string,
    runId: string,
  ): Promise<PublicRunDetail | undefined> {
    return await researchTransaction(this.#database, async (transaction) => {
      const run = await findPublicRun(transaction, principalId, runId);
      if (run === undefined) return undefined;
      const events = await listPublicEvents(transaction, principalId, runId);
      if (events === undefined) return undefined;
      const activeRows = (
        await transaction.query(
          `SELECT logical_key FROM jobs
              WHERE run_id = $1 AND kind = 'research'
                AND status IN ('leased', 'spawn-reserved', 'running', 'cancel-requested')
              ORDER BY created_at, job_id`,
          [runId],
        )
      ).rows.map((row) => ActiveResearchJobRowSchema.parse(row).logical_key);
      const activeActivities = [
        ...new Map(
          activeRows.flatMap((logicalKey) => {
            const actorId = activeJobActor(logicalKey);
            if (actorId === undefined) return [];
            const activity = Object.freeze({
              actorId,
              activity: activeJobActivity(logicalKey),
            }) satisfies ActiveResearchActivity;
            return [
              [`${activity.actorId}:${activity.activity}`, activity] as const,
            ];
          }),
        ).values(),
      ];
      const activeAgentIds = [
        ...new Set(activeActivities.map((activity) => activity.actorId)),
      ];
      const queue = await researchQueueStatus(transaction, runId);
      return {
        run,
        events,
        activeAgentIds,
        activeActivities,
        ...(queue === undefined ? {} : { queue }),
      };
    });
  }

  async report(
    principalId: string,
    reportId: string,
  ): Promise<PublicReport | undefined> {
    return await findPublicReport(this.#database, principalId, reportId);
  }

  async previousComparableReport(
    principalId: string,
    reportId: string,
  ): Promise<PublicReport | undefined> {
    const row = z.object({ report_id: z.string().uuid() }).safeParse(
      (
        await this.#database.query(
          `WITH current_report AS (
            SELECT research_requests.principal_id,
              research_requests.symbol, research_requests.research_kind,
              research_requests.department_id, runs.created_at
            FROM reports
            JOIN runs USING(run_id)
            JOIN research_requests USING(run_id)
            WHERE reports.report_id = $1 AND research_requests.principal_id = $2
          )
          SELECT prior_reports.report_id
          FROM current_report
          JOIN research_requests AS prior_requests
            ON prior_requests.principal_id = current_report.principal_id
           AND prior_requests.symbol = current_report.symbol
           AND prior_requests.research_kind = current_report.research_kind
           AND COALESCE(prior_requests.department_id, '') =
             COALESCE(current_report.department_id, '')
          JOIN runs AS prior_runs ON prior_runs.run_id = prior_requests.run_id
          JOIN reports AS prior_reports
            ON prior_reports.run_id = prior_requests.run_id
           AND prior_reports.state = 'published'
          WHERE prior_runs.created_at < current_report.created_at
          ORDER BY prior_runs.created_at DESC, prior_runs.run_id DESC
          LIMIT 1`,
          [reportId, principalId],
        )
      ).rows[0],
    );
    return row.success
      ? await findPublicReport(this.#database, principalId, row.data.report_id)
      : undefined;
  }

  close(): void {
    // The process owns the shared pool.
  }

  private async count(
    database: ResearchDatabase,
    predicate: string,
  ): Promise<number> {
    return CountRowSchema.parse(
      (
        await database.query(
          `SELECT CAST(COUNT(*) AS integer) AS count FROM runs WHERE ${predicate}`,
          [],
        )
      ).rows[0],
    ).count;
  }
}
