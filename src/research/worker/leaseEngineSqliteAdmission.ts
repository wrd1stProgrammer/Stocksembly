import type Database from "better-sqlite3";
import { z } from "zod";
import { EventIdSchema, RunIdSchema } from "../domain/ids";
import { checkRunAdmission } from "../domain/limits";
import {
  createRun,
  transitionRun,
} from "../server/persistence/sqlite/runRepository";
import type { CreateRunInput } from "../server/persistence/sqlite/types";
import type { RunAdmissionResult } from "./leaseEngineTypes";
import { LEASE_ENGINE_DEFAULTS } from "./leaseEngineTypes";

const CountSchema = z.object({ count: z.number().int().nonnegative() });
const RunRowSchema = z.object({ run_id: RunIdSchema });
const ExhaustedRunSchema = z.object({
  run_id: RunIdSchema,
  version: z.number().int().nonnegative(),
  permanent: z.number().int().nonnegative(),
  failure_code: z.string().nullable(),
});

function exhaustedSummary(code: string): {
  readonly en: string;
  readonly ko: string;
} {
  if (code === "specialist_citation_invalid_after_retry")
    return {
      en: "Research stopped because one specialist cited unavailable evidence again after a corrective retry.",
      ko: "한 전문 에이전트가 교정 재시도 후에도 제공되지 않은 근거를 다시 인용해 리서치를 중단했습니다.",
    };
  if (code === "chair_synthesis_output_invalid_after_retry")
    return {
      en: "The final chair synthesis did not pass its output validation after two attempts.",
      ko: "최종 의장 종합 결과가 두 번의 시도 후에도 출력 검증을 통과하지 못했습니다.",
    };
  if (code === "sec_primary_filing_missing" || code === "sec_10k_missing")
    return {
      en: "Research stopped because no usable SEC company filing was available for this security.",
      ko: "이 종목에서 분석에 사용할 수 있는 SEC 기업 공시를 찾지 못해 리서치를 중단했습니다.",
    };
  return {
    en: "Research stopped after the available attempt was exhausted.",
    ko: "허용된 실행 재시도를 소진해 리서치를 중단했습니다.",
  };
}

function count(database: Database.Database, status: string): number {
  return CountSchema.parse(
    database
      .prepare("SELECT COUNT(*) AS count FROM runs WHERE status = ?")
      .get(status),
  ).count;
}

function activeCount(database: Database.Database): number {
  return CountSchema.parse(
    database
      .prepare(`SELECT COUNT(*) AS count FROM runs
        WHERE status IN ('running', 'cancelling')
          AND EXISTS (
            SELECT 1 FROM jobs
            WHERE jobs.run_id = runs.run_id
              AND jobs.kind = 'research'
              AND jobs.status NOT IN ('cancelled', 'succeeded', 'failed')
          )`)
      .get(),
  ).count;
}

function terminalizeOneExhaustedRun(
  database: Database.Database,
  eventId: string,
  now: string,
): boolean {
  const parsed = ExhaustedRunSchema.safeParse(
    database
      .prepare(`SELECT runs.run_id, runs.version,
        (SELECT COUNT(*) FROM run_events WHERE run_id = runs.run_id
          AND event_type = 'attempt_committed' AND state_id = 'failed'
          AND json_extract(payload_json, '$.classification') <> 'incomplete')
          AS permanent,
        (SELECT json_extract(payload_json, '$.code') FROM run_events
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
      .get(),
  );
  if (!parsed.success) return false;
  const runStatus = parsed.data.permanent > 0 ? "failed" : "incomplete";
  const failureCode = parsed.data.failure_code ?? "research_jobs_exhausted";
  transitionRun(database, {
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

export function admitRun(
  database: Database.Database,
  input: CreateRunInput,
): RunAdmissionResult {
  return database
    .transaction(() => {
      const activeRuns = activeCount(database);
      const queuedRuns = count(database, "queued");
      const outcome = checkRunAdmission(activeRuns, queuedRuns);
      if (outcome.kind !== "accepted")
        return { kind: "queue_full", activeRuns, queuedRuns } as const;
      createRun(database, input);
      return { kind: "admitted" } as const;
    })
    .immediate();
}

export function activateNextRun(
  database: Database.Database,
  eventId: string,
  now: string,
): boolean {
  return database
    .transaction(() => {
      if (terminalizeOneExhaustedRun(database, eventId, now)) return true;
      if (activeCount(database) >= LEASE_ENGINE_DEFAULTS.activeRuns)
        return false;
      const value = database
        .prepare(`SELECT run_id FROM runs WHERE status = 'queued'
          ORDER BY created_at, run_id LIMIT 1`)
        .get();
      if (value === undefined) return false;
      const runId = RunRowSchema.parse(value).run_id;
      transitionRun(database, {
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
    })
    .immediate();
}
