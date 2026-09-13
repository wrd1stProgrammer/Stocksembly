import { describe, expect, it } from "vitest";
import { createQuestionAnswerFixture } from "../../workflow/questionAnswer.testSupport";
import { workflowV3PresentationFixture } from "../../workflowV3Presentation.testSupport";
import { QuestionAnswerPostgresAuthority } from "./questionAnswerPostgresAuthority";

describe("QuestionAnswerPostgresAuthority workflow-v3", () => {
  it("loads the canonical report artifact without a second locale field", async () => {
    const fixture = await createQuestionAnswerFixture({
      report: workflowV3PresentationFixture("en"),
    });
    try {
      const database = fixture.database;
      const row = (
        await database.query(
          "SELECT job_id, input_hash FROM jobs WHERE kind = 'qa'",
          [],
        )
      ).rows[0] as { readonly job_id: string; readonly input_hash: string };
      const attemptId = "00000000-0000-4000-8000-000000000199";
      await database.query(
        `INSERT INTO attempts(attempt_id, job_id, run_id, snapshot_id,
          kind, status, logical_artifact_key, input_hash, created_at)
          VALUES ($1, $2, $3, $4, 'qa', 'running', 'question:answer', $5, $6)`,
        [
          attemptId,
          row.job_id,
          fixture.report.runId,
          fixture.report.snapshotId,
          row.input_hash,
          "2026-08-29T00:00:00.000Z",
        ],
      );
      await database.query("UPDATE questions SET status = 'running'", []);
      // Pool is cleaned up after the test.
      const authority = new QuestionAnswerPostgresAuthority(
        fixture.database,
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
