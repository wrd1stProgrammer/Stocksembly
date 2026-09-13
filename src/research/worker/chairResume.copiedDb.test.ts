import { afterEach, describe, expect, it } from "vitest";
import { createResearchTestDatabase } from "../../test/researchPostgres";
import {
  AttemptIdSchema,
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import {
  appendRunEvent,
  createRun,
} from "../server/persistence/postgres/runRepository";
import { chairResumeReceiptExceptionAvailable } from "../workflow/chairResumePermit";
import { ChairSynthesisPromptSchema } from "../workflow/chairSynthesisContracts";
import { resumeCommitteeChair } from "./chairResume";
import { hash, uuid } from "./leaseEngine.testSupport";
import { PostgresLeaseEngineStore } from "./leaseEnginePostgres";

const RUN_ID = uuid(1);
const CHAIR_JOB_ID = uuid(3);
const now = "2026-08-01T03:20:00.000Z";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((close) => close()));
});

async function restoredDatabase() {
  const { pool, close } = await createResearchTestDatabase();
  cleanups.push(close);
  await createRun(pool, {
    runId: RunIdSchema.parse(RUN_ID),
    snapshotId: SnapshotIdSchema.parse(uuid(2)),
    requestedAt: now,
    remainingBaseCalls: 0,
    requestedOptionalCalls: 0,
    requestedReplacementCalls: 2,
    initialJob: {
      jobId: JobIdSchema.parse(CHAIR_JOB_ID),
      kind: "research",
      logicalKey: "chair_synthesis:chair",
      inputHash: hash(3),
      createdAt: now,
    },
    initialEvent: {
      eventId: EventIdSchema.parse(uuid(4)),
      type: "run_queued",
      stateId: "queued",
      occurredAt: now,
    },
  });
  await pool.query(
    "INSERT INTO research_requests(run_id,principal_id,symbol,question,locale,request_hash,created_at) VALUES ($1,$2,'NVDA','Research','en',$2,$3)",
    [RUN_ID, hash(1), now],
  );
  await pool.query(
    "INSERT INTO artifacts(artifact_id,run_id,snapshot_id,content_hash,byte_length,media_type,logical_key,input_hash,created_at) VALUES ($1,$2,$3,$4,2,'application/json','fixture:upstream',$4,$5)",
    [uuid(5), RUN_ID, uuid(2), hash(5), now],
  );
  const stages = [
    ...Array.from({ length: 11 }, (_, i) => `memo:${i === 0 ? "market" : i}`),
    ...Array.from({ length: 4 }, (_, i) => `consolidation:${i}`),
    ...Array.from({ length: 4 }, (_, i) => `challenge:${i}`),
    ...Array.from({ length: 4 }, (_, i) => `response_ballot:${i}`),
    "semantic_audit:system",
  ];
  for (const [i, stage] of stages.entries())
    await pool.query(
      "INSERT INTO jobs(job_id,run_id,snapshot_id,kind,logical_key,input_hash,status,result_artifact_id,created_at) VALUES ($1,$2,$3,'research',$4,$5,'succeeded',$6,$7)",
      [uuid(100 + i), RUN_ID, uuid(2), stage, hash(100 + i), uuid(5), now],
    );
  await pool.query(
    "INSERT INTO attempts(attempt_id,job_id,run_id,snapshot_id,kind,status,logical_artifact_key,input_hash,created_at,outcome) VALUES ($1,$2,$3,$4,'research','failed','chair_synthesis:chair',$5,$6,'failed')",
    [uuid(6), CHAIR_JOB_ID, RUN_ID, uuid(2), hash(3), now],
  );
  await appendRunEvent(pool, {
    runId: RunIdSchema.parse(RUN_ID),
    event: {
      eventId: EventIdSchema.parse(uuid(7)),
      type: "attempt_committed",
      stateId: "incomplete",
      occurredAt: now,
      jobId: JobIdSchema.parse(CHAIR_JOB_ID),
      payload: { code: "codex_process_failed" },
    },
  });
  await pool.query("UPDATE runs SET status='incomplete' WHERE run_id=$1", [
    RUN_ID,
  ]);
  await pool.query("UPDATE jobs SET status='retry-wait' WHERE job_id=$1", [
    CHAIR_JOB_ID,
  ]);
  await pool.query(
    "INSERT INTO idempotency_records(scope,idempotency_key,request_hash,result_json,created_at) VALUES ('worker-retry',$1,$2,$3,$4)",
    [
      CHAIR_JOB_ID,
      hash(8),
      JSON.stringify({
        retryAt: now,
        failureCount: 2,
        circuitOpen: true,
        classification: "transient",
        code: "external_dependency_circuit_open",
      }),
      now,
    ],
  );
  const departments = ["market", "company", "financial", "risk"] as const;
  const prompt = ChairSynthesisPromptSchema.parse({
    kind: "chair_synthesis_input_v1",
    mandate: {
      mandateHash: hash(1),
      scope: "broad",
      locale: "en",
      limitations: [],
    },
    capabilities: [],
    auditedClaimIds: [uuid(9)],
    departmentPositions: departments.map((departmentId) => ({
      departmentId,
      artifactId: uuid(5),
    })),
    ballots: departments.map((departmentId) => ({
      departmentId,
      artifactId: uuid(5),
      vote: "support",
    })),
    dissentClaimIds: [],
    unknownIds: [],
    scenarioIds: [],
    changeConditionClaimIds: [],
    sourceArtifactIds: [uuid(5)],
    sentences: [
      {
        sentenceId: "one",
        kind: "claim",
        claimIds: [uuid(9)],
        sourceArtifactIds: [uuid(5)],
        text: { en: "Supported evidence", ko: "확인된 근거" },
      },
    ],
  });
  await pool.query(
    "INSERT INTO idempotency_records(scope,idempotency_key,request_hash,result_json,created_at) VALUES ('chair-synthesis-job',$1,$2,$3,$4)",
    [
      RUN_ID,
      hash(9),
      JSON.stringify({ validationPrompt: JSON.stringify(prompt) }),
      now,
    ],
  );
  return pool;
}

describe("restored PostgreSQL chair resume", () => {
  it("keeps the persisted chair validation prompt schema-valid", async () => {
    const pool = await restoredDatabase();
    const row = (
      await pool.query<{ result_json: string }>(
        "SELECT result_json FROM idempotency_records WHERE scope='chair-synthesis-job' AND idempotency_key=$1",
        [RUN_ID],
      )
    ).rows[0];
    if (!row) throw new Error("missing persisted prompt");
    const job = JSON.parse(row.result_json) as { validationPrompt: string };
    expect(
      ChairSynthesisPromptSchema.safeParse(JSON.parse(job.validationPrompt))
        .success,
    ).toBe(true);
  });
  it("reopens only chair without changing upstream history and rejects a second authorization", async () => {
    const pool = await restoredDatabase();
    const before = (
      await pool.query("SELECT * FROM jobs WHERE job_id<>$1 ORDER BY job_id", [
        CHAIR_JOB_ID,
      ])
    ).rows;
    const events = (
      await pool.query("SELECT * FROM run_events ORDER BY sequence")
    ).rows;
    const input = { pool, runId: RUN_ID, authorizationId: uuid(1000), now };
    expect(await resumeCommitteeChair(input)).toMatchObject({
      kind: "resumed",
      grantedLaunch: 0,
    });
    expect(
      (
        await pool.query(
          "SELECT * FROM jobs WHERE job_id<>$1 ORDER BY job_id",
          [CHAIR_JOB_ID],
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await pool.query("SELECT * FROM run_events ORDER BY sequence")
      ).rows.slice(0, events.length),
    ).toEqual(events);
    expect(await resumeCommitteeChair(input)).toMatchObject({
      kind: "already_applied",
    });
    expect(
      await resumeCommitteeChair({ ...input, authorizationId: uuid(1001) }),
    ).toEqual({ kind: "rejected", reason: "already_resumed" });
  });
  it.each([
    ["wrong_status", "UPDATE runs SET status='failed' WHERE run_id=$1"],
    [
      "upstream_incomplete",
      "UPDATE jobs SET status='failed' WHERE run_id=$1 AND logical_key='memo:market'",
    ],
    [
      "wrong_stage",
      "UPDATE jobs SET logical_key='chair_other:chair' WHERE run_id=$1 AND logical_key='chair_synthesis:chair'",
    ],
    [
      "wrong_target",
      "UPDATE research_requests SET research_kind='department' WHERE run_id=$1",
    ],
    [
      "circuit_not_retryable",
      "UPDATE idempotency_records SET result_json=jsonb_set(result_json::jsonb,'{circuitOpen}','false')::text WHERE scope='worker-retry' AND idempotency_key IN (SELECT job_id FROM jobs WHERE run_id=$1)",
    ],
  ])("rejects %s", async (reason, sql) => {
    const pool = await restoredDatabase();
    await pool.query(sql, [RUN_ID]);
    expect(
      await resumeCommitteeChair({
        pool,
        runId: RUN_ID,
        authorizationId: uuid(1002),
        now,
      }),
    ).toEqual({ kind: "rejected", reason });
  });
  it("rejects multiple chair jobs and an existing publication", async () => {
    const pool = await restoredDatabase();
    await pool.query(
      "INSERT INTO jobs(job_id,run_id,snapshot_id,kind,logical_key,input_hash,status,created_at) SELECT $1,run_id,snapshot_id,'research','chair_synthesis:backup',$2,'retry-wait',created_at FROM runs WHERE run_id=$3",
      [uuid(1003), hash(1), RUN_ID],
    );
    expect(
      await resumeCommitteeChair({
        pool,
        runId: RUN_ID,
        authorizationId: uuid(1004),
        now,
      }),
    ).toEqual({ kind: "rejected", reason: "multiple_chair_jobs" });
    await pool.query("DELETE FROM jobs WHERE job_id=$1", [uuid(1003)]);
    await pool.query(
      "INSERT INTO reports(report_id,run_id,snapshot_id,state,created_at) SELECT $1,run_id,snapshot_id,'published',created_at FROM runs WHERE run_id=$2",
      [uuid(1005), RUN_ID],
    );
    expect(
      await resumeCommitteeChair({
        pool,
        runId: RUN_ID,
        authorizationId: uuid(1004),
        now,
      }),
    ).toEqual({ kind: "rejected", reason: "report_published" });
  });
  it("consumes one authorization exactly once across concurrent callers", async () => {
    const pool = await restoredDatabase();
    const input = { pool, runId: RUN_ID, authorizationId: uuid(1006), now };
    expect(
      (
        await Promise.all([
          resumeCommitteeChair(input),
          resumeCommitteeChair(input),
        ])
      )
        .map((r) => r.kind)
        .sort(),
    ).toEqual(["already_applied", "resumed"]);
    expect(
      (
        await pool.query(
          "SELECT COUNT(*)::integer n FROM run_events WHERE event_type='chair_resume_authorized'",
        )
      ).rows,
    ).toEqual([{ n: 1 }]);
  });
  it("reactivates the same authorization and consumes its receipt exception on reservation", async () => {
    const pool = await restoredDatabase();
    const input = { pool, runId: RUN_ID, authorizationId: uuid(1007), now };
    expect(await resumeCommitteeChair(input)).toMatchObject({
      kind: "resumed",
    });
    await pool.query("UPDATE runs SET status='incomplete' WHERE run_id=$1", [
      RUN_ID,
    ]);
    await appendRunEvent(pool, {
      runId: RunIdSchema.parse(RUN_ID),
      event: {
        eventId: EventIdSchema.parse(uuid(1008)),
        type: "run_incomplete",
        stateId: "incomplete",
        occurredAt: now,
        payload: { code: "chair_synthesis:replacement_exhausted" },
      },
    });
    expect(await resumeCommitteeChair(input)).toMatchObject({
      kind: "already_applied",
    });
    const store = new PostgresLeaseEngineStore(pool);
    expect(await store.activateNextRun(uuid(1009), now)).toBe(true);
    expect(await chairResumeReceiptExceptionAvailable(pool, RUN_ID)).toBe(true);
    const claim = await store.claim(
      "receipt-worker",
      now,
      "2026-08-01T03:21:00.000Z",
    );
    expect(claim?.logicalKey).toBe("chair_synthesis:chair");
    if (!claim) throw new Error("chair claim missing");
    expect(
      await store.reserve({
        claim,
        attemptId: AttemptIdSchema.parse(uuid(1010)),
        eventId: EventIdSchema.parse(uuid(1011)),
        now,
      }),
    ).toMatchObject({ kind: "reserved" });
    expect(await chairResumeReceiptExceptionAvailable(pool, RUN_ID)).toBe(
      false,
    );
    await store.close();
  });
});
