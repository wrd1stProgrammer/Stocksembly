import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { workflowV3PresentationFixture } from "../../workflowV3Presentation.testSupport";
import { createQuestionAnswerFixture } from "../../workflow/questionAnswer.testSupport";
import { QuestionAnswerSqliteAuthority } from "./questionAnswerSqliteAuthority";

describe("QuestionAnswerSqliteAuthority workflow-v3", () => {
  it("loads the canonical report artifact without a second locale field", async () => {
    const fixture = await createQuestionAnswerFixture({
      report: workflowV3PresentationFixture("en"),
    });
    try {
      const database = new Database(fixture.databasePath);
      const row = database
        .prepare("SELECT job_id, input_hash FROM jobs WHERE kind = 'qa'")
        .get() as { readonly job_id: string; readonly input_hash: string };
      const attemptId = "00000000-0000-4000-8000-000000000199";
      database
        .prepare(`INSERT INTO attempts(attempt_id, job_id, run_id, snapshot_id,
          kind, status, logical_artifact_key, input_hash, created_at)
          VALUES (?, ?, ?, ?, 'qa', 'running', 'question:answer', ?, ?)`)
        .run(
          attemptId,
          row.job_id,
          fixture.report.runId,
          fixture.report.snapshotId,
          row.input_hash,
          "2026-08-29T00:00:00.000Z",
        );
      database.prepare("UPDATE questions SET status = 'running'").run();
      database.close();
      const authority = new QuestionAnswerSqliteAuthority(
        fixture.databasePath,
        fixture.cas,
      );
      const loaded = await authority.load(attemptId);
      authority.close();
      expect(loaded?.report.schemaVersion).toBe("workflow-v3");
      expect(loaded?.report).not.toHaveProperty("locales");
    } finally {
      fixture.cleanup();
    }
  });
});
