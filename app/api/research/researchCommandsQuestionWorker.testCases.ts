import { expect, it } from "vitest";
import { createOfficialAttemptHandler } from "../../../src/research/compositions/officialWorker";
import { createLeaseEngine } from "../../../src/research/worker/leaseEngine";
import { QuestionCodexFake } from "../../../src/research/workflow/questionAnswer.testSupport";
import {
  createRun,
  databaseScalar,
  postQuestion,
  publishRun,
  setRunStatus,
} from "./researchCommands.testSupport";
import type { ApiHarness } from "./researchRoutes.testSupport";
import { json } from "./researchRoutes.testSupport";

export function registerResearchQuestionWorkerTests(
  harnessValue: () => ApiHarness,
): void {
  it("answers the persisted API question with one grounded worker spawn", async () => {
    const harness = harnessValue();
    const run = await createRun(harness, "question-worker-parent");
    const publication = await publishRun(harness, run);
    const eventCountBefore = databaseScalar(
      harness,
      "SELECT COUNT(*) FROM run_events WHERE run_id = ?",
      run.runId,
    );
    const highWaterBefore = databaseScalar(
      harness,
      "SELECT last_event_seq FROM runs WHERE run_id = ?",
      run.runId,
    );
    const created = await postQuestion(
      harness,
      publication.reportId,
      "question-worker",
      { question: "What supports the margin view?", locale: "en" },
    );
    const codex = new QuestionCodexFake();
    const official = await createOfficialAttemptHandler(
      {
        dataDirectory: harness.root,
        databasePath: harness.databasePath,
        ownerId: "api-question-worker",
      },
      { codex, now: () => "2026-07-23T06:00:00.000Z" },
    );
    const engine = createLeaseEngine({
      databasePath: harness.databasePath,
      ownerId: "api-question-worker",
      handler: official.handler,
      clock: { now: () => "2026-07-23T06:00:00.000Z" },
    });

    try {
      const handled = await engine.poll();
      const detail = await harness.api.handle(
        harness.request(
          `/api/research/questions/${created.question?.questionId}`,
        ),
      );
      const detailBody = await json(detail);

      expect(handled).toMatchObject({ kind: "handled", committed: true });
      expect(codex.launches).toBe(1);
      expect(detailBody).toMatchObject({
        question: {
          status: "answered",
          answer: {
            elements: [
              {
                claimId: publication.body.claims[0]?.claimId,
                sourceIds: publication.body.claims[0]?.sourceIds,
              },
            ],
          },
        },
      });
      expect(
        databaseScalar(harness, "SELECT COUNT(*) FROM question_call_ordinals"),
      ).toBe(1);
      expect(
        databaseScalar(
          harness,
          "SELECT COUNT(*) FROM question_runner_evidence",
        ),
      ).toBe(1);
      expect(
        databaseScalar(
          harness,
          "SELECT COUNT(*) FROM run_events WHERE run_id = ?",
          run.runId,
        ),
      ).toBe(eventCountBefore);
      expect(
        databaseScalar(
          harness,
          "SELECT last_event_seq FROM runs WHERE run_id = ?",
          run.runId,
        ),
      ).toBe(highWaterBefore);
    } finally {
      await engine.shutdown();
      await official.close();
    }
  });

  it("rejects Q&A when the published report run is no longer publishable", async () => {
    const harness = harnessValue();
    const run = await createRun(harness, "question-failed-published-run");
    const publication = await publishRun(harness, run);
    setRunStatus(harness, run.runId, "failed");

    const rejected = await postQuestion(
      harness,
      publication.reportId,
      "question-failed-published-run",
      { question: "Explain the report", locale: "en" },
    );

    expect(rejected.response.status).toBe(409);
    expect(rejected.body).toEqual({ error: { code: "COMMAND_NOT_ALLOWED" } });
    expect(databaseScalar(harness, "SELECT COUNT(*) FROM questions")).toBe(0);
    expect(
      databaseScalar(harness, "SELECT COUNT(*) FROM jobs WHERE kind = 'qa'"),
    ).toBe(0);
  });
}
