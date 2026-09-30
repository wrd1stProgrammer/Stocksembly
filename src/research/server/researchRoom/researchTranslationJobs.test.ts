// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { PublicRunDetailSchema } from "../../client/schemas";
import { researchReportToFile } from "../../researchReportToFile";
import { workflowV3PresentationFixture } from "../../workflowV3Presentation.testSupport";
import {
  cleanupApiTestDatabases,
  createApiTestDatabase,
} from "../api/postgresApi.testSupport";
import {
  type ResearchTranslationJobInput,
  requestResearchTranslation,
  runResearchTranslationJob,
} from "./researchTranslationJobs";

afterEach(cleanupApiTestDatabases);

async function fixture() {
  const database = await createApiTestDatabase();
  await database.query("CREATE TABLE reports(report_id TEXT PRIMARY KEY)");
  await database.query(
    await readFile(
      new URL(
        "../persistence/postgres/migrations/007_report_translation_jobs.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const reportId = "10000000-0000-4000-8000-000000000001";
  const runId = "10000000-0000-4000-8000-000000000002";
  await database.query("INSERT INTO reports VALUES ($1)", [reportId]);
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
  return { database, input, result };
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
    status: "succeeded",
    result_json: result,
  });
  expect(await runResearchTranslationJob(database, translate)).toBe(false);
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
