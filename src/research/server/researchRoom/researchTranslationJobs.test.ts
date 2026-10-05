// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { PostgresAccountStore } from "../../../accounts/server/postgresAccountStore";
import { createResearchTestDatabase } from "../../../test/researchPostgres";
import { PublicRunDetailSchema } from "../../client/schemas";
import { researchReportToFile } from "../../researchReportToFile";
import { workflowV3PresentationFixture } from "../../workflowV3Presentation.testSupport";
import {
  type ResearchTranslationJobInput,
  requestResearchTranslation,
  runResearchTranslationJob,
} from "./researchTranslationJobs";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});

async function fixture() {
  const db = await createResearchTestDatabase();
  const database = db.pool;
  const accountStore = await PostgresAccountStore.create({
    ...database.options,
    options: "-c search_path=public,pg_catalog",
  });
  cleanups.push(async () => {
    await accountStore.close();
    await db.close();
  });
  const reportId = "10000000-0000-4000-8000-000000000001";
  const runId = "10000000-0000-4000-8000-000000000002";
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO runs(run_id,snapshot_id,status,created_at) VALUES ($1,'snapshot','completed',$2)",
      [runId, new Date().toISOString()],
    );
    await client.query(
      "INSERT INTO snapshots(snapshot_id,run_id,state,requested_at) VALUES ('snapshot',$1,'sealed',$2)",
      [runId, new Date().toISOString()],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  await database.query(
    "INSERT INTO reports(report_id, run_id, snapshot_id, state, created_at) VALUES ($1, $2, $3, 'published', $4)",
    [reportId, runId, "snapshot", new Date().toISOString()],
  );
  const input: ResearchTranslationJobInput = {
    reportId,
    runId,
    file: researchReportToFile(
      workflowV3PresentationFixture("en"),
      "2026-09-30T00:00:00.000Z",
    ),
    question: "Should I wait for earnings?",
    runDetail: PublicRunDetailSchema.parse({
      run: {
        runId,
        snapshotId: "10000000-0000-4000-8000-000000000003",
        symbol: "NVDA",
        locale: "en",
        status: "completed",
        lastEventSeq: 0,
        createdAt: "2026-09-30T00:00:00.000Z",
        reportId,
      },
      events: [],
    }),
    conversation: [],
    sourceLocale: "en",
    targetLocale: "ko",
  };
  const result = {
    file: input.file,
    question: "실적 발표까지 기다릴까요?",
    runDetail: input.runDetail,
    conversation: [],
    renderLocale: "ko" as const,
  };
  return { database, accountStore, input, result };
}

it("queues duplicate web requests once and only a worker executes the translation", async () => {
  const { database, input, result } = await fixture();
  const requests = await Promise.all([
    requestResearchTranslation(database, input, true),
    requestResearchTranslation(database, input, true),
  ]);
  expect(requests.map((value) => value.status)).toEqual(["queued", "queued"]);
  const translate = vi.fn(async () => result);
  await Promise.all([
    runResearchTranslationJob(database, translate),
    runResearchTranslationJob(database, translate),
  ]);
  expect(translate).toHaveBeenCalledTimes(1);
  expect(await requestResearchTranslation(database, input, false)).toEqual({
    jobKey: expect.any(String),
    status: "succeeded",
    result_json: result,
  });
  expect(await runResearchTranslationJob(database, translate)).toBe(false);
});

it("atomically admits affordable work, rolls back failed admission and refunds worker failure", async () => {
  const { database, accountStore, input } = await fixture();
  const id = "d".repeat(64);
  await accountStore.syncUser({ kind: "local", id }, new Date().toISOString());
  await expect(
    accountStore.consumeResearchTranslationCredit(
      id,
      "failed-admission",
      input.reportId,
      "ko",
      async () => {
        throw new Error("queue unavailable");
      },
    ),
  ).rejects.toThrow();
  expect(
    (
      await database.query(
        "SELECT * FROM public.usage_events WHERE event_key = 'failed-admission'",
      )
    ).rowCount,
  ).toBe(0);
  const admit = async (client: import("pg").PoolClient) => {
    const job = await requestResearchTranslation(client, input, false);
    if (job.status === "failed") throw new Error("failed");
    return { jobKey: job.jobKey, status: job.status };
  };
  const credits = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      accountStore.consumeResearchTranslationCredit(
        id,
        `attempt-${index}`,
        input.reportId,
        "ko",
        admit,
      ),
    ),
  );
  expect(credits.every((credit) => credit.allowed)).toBe(true);
  expect(
    (
      await database.query(
        "SELECT * FROM public.usage_events WHERE kind = 'research_translation'",
      )
    ).rowCount,
  ).toBe(1);
  await runResearchTranslationJob(database, async () => {
    throw new Error("provider unavailable");
  });
  expect(
    (
      await database.query(
        "SELECT * FROM public.usage_events WHERE kind = 'research_translation'",
      )
    ).rowCount,
  ).toBe(0);
});

it("does not retry failed jobs on polling, but allows an explicit retry", async () => {
  const { database, input, result } = await fixture();
  await requestResearchTranslation(database, input, true);
  await runResearchTranslationJob(database, async () => {
    throw new Error("auth_unavailable");
  });
  expect(
    (await requestResearchTranslation(database, input, false)).status,
  ).toBe("failed");
  expect((await requestResearchTranslation(database, input, true)).status).toBe(
    "queued",
  );
  await runResearchTranslationJob(database, async () => result);
  expect(
    (await requestResearchTranslation(database, input, false)).status,
  ).toBe("succeeded");
});

it("never enqueues more concurrent translations than available credits", async () => {
  const { database, accountStore, input } = await fixture();
  const id = "e".repeat(64);
  await accountStore.syncUser({ kind: "local", id }, new Date().toISOString());
  const locales = ["ko", "ja", "de", "fr", "es", "pt-BR"] as const;
  const results = await Promise.all(
    locales.map((targetLocale) =>
      accountStore.consumeResearchTranslationCredit(
        id,
        `locale-${targetLocale}`,
        input.reportId,
        targetLocale,
        async (client) => {
          const job = await requestResearchTranslation(
            client,
            { ...input, targetLocale },
            false,
          );
          if (job.status === "failed") throw new Error("failed");
          return { jobKey: job.jobKey, status: job.status };
        },
      ),
    ),
  );
  expect(results.filter((result) => result.allowed)).toHaveLength(5);
  expect(
    (await database.query("SELECT * FROM research_report_translation_jobs"))
      .rowCount,
  ).toBe(5);
  const callback = vi.fn();
  expect(
    (
      await accountStore.consumeResearchTranslationCredit(
        id,
        "empty",
        input.reportId,
        "zh-TW",
        callback,
      )
    ).allowed,
  ).toBe(false);
  expect(callback).not.toHaveBeenCalled();
});

it("recovers an expired worker lease after a restart", async () => {
  const { database, input, result } = await fixture();
  await requestResearchTranslation(database, input, true);
  await database.query(
    "UPDATE research_report_translation_jobs SET status = 'running', lease_until = now() - interval '1 minute'",
  );
  expect(await runResearchTranslationJob(database, async () => result)).toBe(
    true,
  );
  expect(
    (await requestResearchTranslation(database, input, false)).status,
  ).toBe("succeeded");
});
