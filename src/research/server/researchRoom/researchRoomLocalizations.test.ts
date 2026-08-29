import { writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { PublicRunDetailSchema } from "../../client/schemas";
import { researchReportToFile } from "../../researchReportToFile";
import { workflowV3PresentationFixture } from "../../workflowV3Presentation.testSupport";
import {
  publicResearchTranslationItems,
  RESEARCH_TRANSLATION_SCHEMA_VERSION,
  type ResearchTranslationCacheKey,
  researchTranslationModelCalls,
  translatedResearchProjection,
} from "./researchRoomLocalizations";
import {
  planResearchTranslationBatches,
  RESEARCH_TRANSLATION_MODEL_VERSION,
} from "./researchTranslationRunner";

const roots: string[] = [];
const reportId = "10000000-0000-4000-8000-000000000001";
const runId = "10000000-0000-4000-8000-000000000002";
const snapshotId = "10000000-0000-4000-8000-000000000003";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => await rm(root, { recursive: true })),
  );
});

async function translationDatabase() {
  const root = await mkdtemp(join(tmpdir(), "stocksembly-translation-test-"));
  roots.push(root);
  const path = join(root, "research.sqlite");
  const database = new Database(path);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE reports(report_id TEXT PRIMARY KEY);
    CREATE TABLE artifacts(
      artifact_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL
    );
    CREATE TABLE report_versions(
      report_id TEXT NOT NULL, run_id TEXT NOT NULL, version INTEGER NOT NULL,
      artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id)
    );
    CREATE TABLE research_requests(run_id TEXT PRIMARY KEY);
    CREATE TABLE research_question_localizations(
      run_id TEXT NOT NULL REFERENCES research_requests(run_id) ON DELETE CASCADE,
      locale TEXT NOT NULL, question TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(run_id, locale)
    );
    CREATE TABLE research_report_translations(
      report_id TEXT NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
      locale TEXT NOT NULL, source_locale TEXT, report_version INTEGER,
      source_content_hash TEXT, translation_schema_version INTEGER,
      model_version TEXT, file_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX research_report_translation_cache_key
      ON research_report_translations(
        report_id, report_version, source_content_hash, source_locale, locale,
        translation_schema_version, model_version
      );
    CREATE TABLE research_translation_model_calls(
      invocation_id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
      report_version INTEGER NOT NULL, source_content_hash TEXT NOT NULL,
      source_locale TEXT NOT NULL, target_locale TEXT NOT NULL,
      translation_schema_version INTEGER NOT NULL, model_version TEXT NOT NULL,
      batch_ordinal INTEGER NOT NULL, batch_input_hash TEXT NOT NULL,
      outcome TEXT NOT NULL, created_at TEXT NOT NULL
    );
    INSERT INTO reports(report_id) VALUES ('${reportId}');
    INSERT INTO research_requests(run_id) VALUES ('${runId}');
    INSERT INTO artifacts(artifact_id, content_hash)
      VALUES ('artifact-a', '${hashA}');
    INSERT INTO report_versions(report_id, run_id, version, artifact_id)
      VALUES ('${reportId}', '${runId}', 1, 'artifact-a');
  `);
  database.close();
  return path;
}

function fixture() {
  const report = workflowV3PresentationFixture("en");
  const file = researchReportToFile(report, "2026-08-29T00:00:00.000Z");
  const runDetail = PublicRunDetailSchema.parse({
    run: {
      runId,
      snapshotId,
      symbol: "NVDA",
      question: "Should I wait for earnings?",
      locale: "en",
      researchTarget: { kind: "committee" },
      status: "completed",
      lastEventSeq: 0,
      createdAt: "2026-08-29T00:00:00.000Z",
      reportId,
    },
    events: [],
  });
  const conversation = Array.from({ length: 81 }, (_, index) => ({
    question:
      index === 79
        ? "https://www.sec.gov/Archives/edgar/data/1045810"
        : `Public follow-up ${index}: ${"context ".repeat(70)}`,
    answer:
      index === 80
        ? "NVDA-10-K-2026"
        : `Public answer ${index}: ${"analysis ".repeat(70)}`,
    agentId: `agent-${index}`,
    createdAt: "2026-08-29T00:00:00.000Z",
  }));
  return { file, runDetail, conversation };
}

function cacheKey(
  sourceContentHash: string,
  overrides: Partial<ResearchTranslationCacheKey> = {},
): ResearchTranslationCacheKey {
  return {
    reportId,
    reportVersion: 1,
    sourceContentHash,
    sourceLocale: "en",
    targetLocale: "ja",
    translationSchemaVersion: RESEARCH_TRANSLATION_SCHEMA_VERSION,
    modelVersion: RESEARCH_TRANSLATION_MODEL_VERSION,
    ...overrides,
  };
}

const invokeBatch = async (
  items: readonly { readonly id: string; readonly text: string }[],
) => new Map(items.map((item) => [item.id, `JA:${item.text}`]));

describe("versioned research translation projections", () => {
  it("records exact planned batches once and serves identical cache bytes without a call", async () => {
    const databasePath = await translationDatabase();
    const source = fixture();
    const database = new Database(databasePath);
    database
      .prepare(`INSERT INTO research_report_translations(
        report_id, locale, file_json, created_at
      ) VALUES (?, 'ja', ?, '2026-08-01T00:00:00.000Z')`)
      .run(reportId, JSON.stringify({ schemaVersion: 1, file: source.file }));
    database.close();
    let actualInvocationCount = 0;
    const exactPlan = planResearchTranslationBatches(
      publicResearchTranslationItems(
        source.file,
        "Should I wait for earnings?",
        source.runDetail,
        source.conversation,
        "en",
      ),
    );
    const instrumentedInvoke = async (
      items: readonly { readonly id: string; readonly text: string }[],
    ) => {
      actualInvocationCount += 1;
      return invokeBatch(items);
    };

    const beforeFirst = researchTranslationModelCalls(
      databasePath,
      cacheKey(hashA),
    ).length;
    const first = await translatedResearchProjection(
      databasePath,
      reportId,
      runId,
      source.file,
      "Should I wait for earnings?",
      source.runDetail,
      source.conversation,
      "en",
      "ja",
      { invokeBatch: instrumentedInvoke },
    );
    const afterFirstRows = researchTranslationModelCalls(
      databasePath,
      cacheKey(hashA),
    );
    const expectedBatchCount = exactPlan.length;
    const beforeSecond = afterFirstRows.length;
    const second = await translatedResearchProjection(
      databasePath,
      reportId,
      runId,
      source.file,
      "Should I wait for earnings?",
      source.runDetail,
      source.conversation,
      "en",
      "ja",
      { invokeBatch: instrumentedInvoke },
    );
    const afterSecond = researchTranslationModelCalls(
      databasePath,
      cacheKey(hashA),
    ).length;

    expect(expectedBatchCount).toBeGreaterThan(1);
    expect(afterFirstRows.length - beforeFirst).toBe(expectedBatchCount);
    expect(afterFirstRows.map((row) => row.batchOrdinal)).toEqual(
      Array.from({ length: expectedBatchCount }, (_, index) => index + 1),
    );
    expect(new Set(afterFirstRows.map((row) => row.batchInputHash)).size).toBe(
      expectedBatchCount,
    );
    expect(afterFirstRows.every((row) => row.outcome === "succeeded")).toBe(
      true,
    );
    expect(beforeSecond).toBe(afterFirstRows.length);
    expect(afterSecond).toBe(beforeSecond);
    expect(actualInvocationCount).toBe(expectedBatchCount);
    expect(
      afterFirstRows.map((row) => [row.batchOrdinal, row.batchInputHash]),
    ).toEqual(exactPlan.map((batch) => [batch.ordinal, batch.inputHash]));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.file.evidenceIndex).toEqual(source.file.evidenceIndex);
    expect(first.conversation[79]?.question).toBe(
      "https://www.sec.gov/Archives/edgar/data/1045810",
    );
    expect(first.conversation[80]?.answer).toBe("NVDA-10-K-2026");
    const evidencePath = process.env["TASK9_DB_PROOF_PATH"];
    if (evidencePath !== undefined)
      writeFileSync(
        evidencePath,
        `${JSON.stringify(
          {
            cacheKey: cacheKey(hashA),
            beforeFirst,
            afterFirst: afterFirstRows.length,
            beforeSecond,
            afterSecond,
            actualInvocationCount,
            batches: afterFirstRows.map((row) => ({
              ordinal: row.batchOrdinal,
              inputHash: row.batchInputHash,
              outcome: row.outcome,
            })),
            cacheByteIdentical:
              JSON.stringify(second) === JSON.stringify(first),
            preservedUrl: first.conversation[79]?.question,
            preservedIdentifier: first.conversation[80]?.answer,
          },
          null,
          2,
        )}\n`,
      );
  });

  it("misses lazily for changed content, schema, and model keys", async () => {
    const databasePath = await translationDatabase();
    const source = fixture();
    let capturedItems: readonly {
      readonly id: string;
      readonly text: string;
    }[] = [];
    const captureInvoke = async (
      items: readonly { readonly id: string; readonly text: string }[],
    ) => {
      capturedItems = [...capturedItems, ...items];
      return invokeBatch(items);
    };
    await translatedResearchProjection(
      databasePath,
      reportId,
      runId,
      source.file,
      "Should I wait for earnings?",
      source.runDetail,
      source.conversation,
      "en",
      "ja",
      { invokeBatch: captureInvoke },
    );
    const firstPlan = planResearchTranslationBatches(capturedItems);
    capturedItems = [];
    const database = new Database(databasePath);
    database
      .prepare(
        `UPDATE artifacts SET content_hash = ? WHERE artifact_id = 'artifact-a'`,
      )
      .run(hashB);
    database.close();
    await translatedResearchProjection(
      databasePath,
      reportId,
      runId,
      source.file,
      "Should I wait for earnings?",
      source.runDetail,
      source.conversation,
      "en",
      "ja",
      { invokeBatch: captureInvoke },
    );
    const changedHashRows = researchTranslationModelCalls(
      databasePath,
      cacheKey(hashB),
    );

    expect(firstPlan.length).toBeGreaterThan(1);
    expect(changedHashRows).toHaveLength(firstPlan.length);
    expect(capturedItems.length).toBeGreaterThan(0);

    capturedItems = [];
    await translatedResearchProjection(
      databasePath,
      reportId,
      runId,
      source.file,
      "Should I wait for earnings?",
      source.runDetail,
      source.conversation,
      "en",
      "ja",
      {
        translationSchemaVersion: RESEARCH_TRANSLATION_SCHEMA_VERSION + 1,
        modelVersion: `${RESEARCH_TRANSLATION_MODEL_VERSION}-next`,
        invokeBatch: captureInvoke,
      },
    );
    expect(
      researchTranslationModelCalls(
        databasePath,
        cacheKey(hashB, {
          translationSchemaVersion: RESEARCH_TRANSLATION_SCHEMA_VERSION + 1,
          modelVersion: `${RESEARCH_TRANSLATION_MODEL_VERSION}-next`,
        }),
      ),
    ).toHaveLength(firstPlan.length);
    expect(capturedItems.length).toBeGreaterThan(0);
  });
});
