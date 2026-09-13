import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrateResearchDatabase } from "../persistence/postgres/migrations";
import { NormalizedResearchRequestSchema } from "./researchApiContracts";
import { ResearchApiRepository } from "./researchApiRepository";
import { ResearchCommandRepository } from "./researchCommandRepository";
import { RunEventsSseRepository } from "./runEventsSseRepository";

const pool = new Pool({
  connectionString:
    process.env["STOCKSEMBLY_API_TEST_DATABASE_URL"] ??
    "postgresql://127.0.0.1:55432/stocksembly_api_test",
  options: "-c search_path=research,pg_catalog",
});
const ids = () => ({
  runId: randomUUID(),
  snapshotId: randomUUID(),
  jobId: randomUUID(),
  eventId: randomUUID(),
  questionId: randomUUID(),
});
beforeAll(async () => {
  await migrateResearchDatabase(pool);
});
afterAll(async () => {
  await pool.end();
});

it("atomically replays concurrent research requests and preserves event ownership during cancellation", async () => {
  const repository = new ResearchApiRepository({ database: pool });
  const commands = new ResearchCommandRepository({ database: pool });
  const events = new RunEventsSseRepository({ database: pool });
  const principalId = randomUUID().replaceAll("-", "").repeat(2);
  const command = {
    principalId,
    idempotencyKey: randomUUID(),
    request: NormalizedResearchRequestSchema.parse({
      symbol: "NVDA",
      question: "Growth durability?",
      locale: "en",
    }),
    ids: ids(),
    now: new Date().toISOString(),
  };
  const results = await Promise.all([
    repository.create(command),
    repository.create({ ...command, ids: ids() }),
  ]);
  expect(results.map((result) => result.kind).sort()).toEqual([
    "created",
    "replayed",
  ]);
  const runs = await repository.listRuns(principalId, 10);
  expect(runs).toHaveLength(1);
  expect(await repository.detail(principalId, command.ids.runId)).toMatchObject(
    { run: { status: "queued" } },
  );
  expect(
    await events.snapshot("another-user", command.ids.runId, 0),
  ).toBeUndefined();
  const context = {
    principalId,
    idempotencyKey: randomUUID(),
    now: command.now,
    ids: ids(),
  };
  const cancelled = await commands.cancel(command.ids.runId, context);
  expect(cancelled).toMatchObject({
    kind: "created",
    value: { status: "cancelled" },
  });
  expect(await commands.cancel(command.ids.runId, context)).toMatchObject({
    kind: "replayed",
  });
  const snapshot = await events.snapshot(principalId, command.ids.runId, 0);
  expect(snapshot).toMatchObject({
    status: "cancelled",
    lineageComplete: true,
    lastEventSeq: 3,
  });
  expect(snapshot?.entries).toHaveLength(3);
});

it("resumes the same failed run and resets retry metadata without duplicating research", async () => {
  const repository = new ResearchApiRepository({ database: pool });
  const commands = new ResearchCommandRepository({ database: pool });
  const principalId = randomUUID().replaceAll("-", "").repeat(2);
  const runIds = ids();
  const now = new Date().toISOString();
  await repository.create({
    principalId,
    idempotencyKey: randomUUID(),
    ids: runIds,
    now,
    request: NormalizedResearchRequestSchema.parse({
      symbol: "AMD",
      question: "Margins?",
      locale: "en",
    }),
  });
  await pool.query("UPDATE runs SET status='failed' WHERE run_id=$1", [
    runIds.runId,
  ]);
  await pool.query("UPDATE jobs SET status='failed' WHERE run_id=$1", [
    runIds.runId,
  ]);
  await pool.query(
    `INSERT INTO idempotency_records(scope,idempotency_key,request_hash,result_json,created_at)
    VALUES('worker-retry',$1,$2,$3,$4)`,
    [
      runIds.jobId,
      "a".repeat(64),
      JSON.stringify({
        classification: "transient",
        failureCount: 2,
        circuitOpen: true,
      }),
      now,
    ],
  );
  const context = {
    principalId,
    idempotencyKey: randomUUID(),
    ids: ids(),
    now,
  };
  expect(await commands.retry(runIds.runId, context)).toMatchObject({
    kind: "created",
    value: { runId: runIds.runId, status: "queued" },
  });
  expect(await commands.retry(runIds.runId, context)).toMatchObject({
    kind: "replayed",
  });
  const retry = await pool.query(
    "SELECT result_json FROM idempotency_records WHERE scope='worker-retry' AND idempotency_key=$1",
    [runIds.jobId],
  );
  expect(JSON.parse(retry.rows[0].result_json)).toMatchObject({
    failureCount: 0,
    circuitOpen: false,
  });
  expect(await repository.listRuns(principalId, 10)).toHaveLength(1);
  await commands.cancel(runIds.runId, {
    ...context,
    idempotencyKey: randomUUID(),
    ids: ids(),
  });
});
