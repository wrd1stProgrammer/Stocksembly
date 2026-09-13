import { z } from "zod";
import { EventIdSchema, RunIdSchema } from "../domain/ids";
import { checkRunAdmission } from "../domain/limits";
import {
  type ResearchDatabase,
  researchTransaction,
} from "../server/persistence/postgres/database";
import { availableExecutionBackend } from "../server/persistence/postgres/runExecutionRepository";
import {
  createRun,
  transitionRun,
} from "../server/persistence/postgres/runRepository";
import type { CreateRunInput } from "../server/persistence/postgres/types";
import type { RunAdmissionResult } from "./leaseEngineTypes";

const CountSchema = z.object({ count: z.coerce.number().int().nonnegative() });
const RunRowSchema = z.object({ run_id: RunIdSchema });
const ExhaustedRunSchema = z.object({
  run_id: RunIdSchema,
  version: z.coerce.number().int().nonnegative(),
  permanent: z.coerce.number().int().nonnegative(),
  failure_code: z.string().nullable(),
});

function exhaustedSummary(code: string): {
  readonly en: string;
  readonly ko: string;
} {
  if (code === "sec_primary_filing_missing" || code === "sec_10k_missing")
    return {
      en: "Research stopped because no usable SEC company filing was available for this security.",
      ko: "이 종목에서 분석에 사용할 수 있는 SEC 기업 공시를 찾지 못해 리서치를 중단했습니다.",
    };
  return {
    en: "Research could not be completed. Finished stages were preserved and no research credit was charged.",
    ko: "리서치를 완성하지 못했습니다. 완료된 단계는 보존되며 리서치 크레딧은 차감되지 않습니다.",
  };
}

async function count(
  database: ResearchDatabase,
  status: string,
): Promise<number> {
  return CountSchema.parse(
    (
      await database.query(
        "SELECT COUNT(*) AS count FROM runs WHERE status = $1",
        [status],
      )
    ).rows[0],
  ).count;
}

async function activeCount(database: ResearchDatabase): Promise<number> {
  return CountSchema.parse(
    (
      await database.query(`SELECT COUNT(*) AS count FROM runs
        WHERE status IN ('running', 'cancelling')
          AND EXISTS (
            SELECT 1 FROM jobs
            WHERE jobs.run_id = runs.run_id
              AND jobs.kind = 'research'
              AND jobs.status NOT IN ('cancelled', 'succeeded', 'failed')
          )`)
    ).rows[0],
  ).count;
}

async function terminalizeOneExhaustedRun(
  database: ResearchDatabase,
  eventId: string,
  now: string,
): Promise<boolean> {
  const parsed = ExhaustedRunSchema.safeParse(
    (
      await database.query(`SELECT runs.run_id, runs.version,
        (SELECT COUNT(*) FROM run_events WHERE run_id = runs.run_id
          AND event_type = 'attempt_committed' AND state_id = 'failed'
          AND (payload_json::jsonb ->> 'classification') <> 'incomplete')
          AS permanent,
        (SELECT (payload_json::jsonb ->> 'code') FROM run_events
          WHERE run_id = runs.run_id AND event_type = 'attempt_committed'
          AND state_id = 'failed'
          ORDER BY sequence DESC LIMIT 1) AS failure_code
      FROM runs WHERE runs.status = 'running'
        AND EXISTS (SELECT 1 FROM jobs WHERE jobs.run_id = runs.run_id
          AND jobs.kind = 'research' AND jobs.status = 'failed')
        AND NOT EXISTS (SELECT 1 FROM jobs WHERE jobs.run_id = runs.run_id
          AND jobs.kind = 'research'
          AND jobs.status NOT IN ('cancelled', 'succeeded', 'failed'))
      ORDER BY runs.created_at, runs.run_id LIMIT 1`)
    ).rows[0],
  );
  if (!parsed.success) return false;
  const runStatus = parsed.data.permanent > 0 ? "failed" : "incomplete";
  const failureCode = parsed.data.failure_code ?? "research_jobs_exhausted";
  await transitionRun(database, {
    runId: parsed.data.run_id,
    fromStatus: "running",
    toStatus: runStatus,
    expectedVersion: parsed.data.version,
    nextJobs: [],
    event: {
      eventId: EventIdSchema.parse(eventId),
      type: runStatus === "failed" ? "run_failed" : "run_incomplete",
      stateId: runStatus,
      occurredAt: now,
      payload: {
        code: failureCode,
        summary: exhaustedSummary(failureCode),
      },
    },
  });
  return true;
}

export async function admitRun(
  database: ResearchDatabase,
  input: CreateRunInput,
): Promise<RunAdmissionResult> {
  return researchTransaction(database, async (database) => {
    await database.query("SELECT pg_advisory_xact_lock(73921402)");
    const activeRuns = await activeCount(database);
    const queuedRuns = await count(database, "queued");
    const outcome = checkRunAdmission(activeRuns, queuedRuns);
    if (outcome.kind !== "accepted")
      return { kind: "queue_full", activeRuns, queuedRuns } as const;
    await createRun(database, input);
    return { kind: "admitted" } as const;
  });
}

export async function activateNextRun(
  database: ResearchDatabase,
  eventId: string,
  now: string,
): Promise<boolean> {
  return researchTransaction(database, async (database) => {
    await database.query("SELECT pg_advisory_xact_lock(73921402)");
    if (await terminalizeOneExhaustedRun(database, eventId, now)) return true;
    const backend = await availableExecutionBackend(database);
    if (backend === undefined) return false;
    const value = (
      await database.query(`SELECT run_id FROM runs WHERE status = 'queued'
          ORDER BY created_at, run_id LIMIT 1`)
    ).rows[0];
    if (value === undefined) return false;
    const runId = RunRowSchema.parse(value).run_id;
    await database.query(
      "UPDATE runs SET execution_backend = $1 WHERE run_id = $2",
      [backend, runId],
    );
    await transitionRun(database, {
      runId,
      fromStatus: "queued",
      toStatus: "running",
      nextJobs: [],
      event: {
        eventId: EventIdSchema.parse(eventId),
        type: "run_started",
        stateId: "running",
        occurredAt: now,
      },
    });
    return true;
  });
}
