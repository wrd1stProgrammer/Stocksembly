import { expect, it } from "vitest";
import {
  commandRequest,
  createRun,
  databaseScalar,
  failQuestion,
  postQuestion,
  publishRun,
} from "./researchCommands.testSupport";
import type { ApiHarness } from "./researchRoutes.testSupport";
import { json } from "./researchRoutes.testSupport";

export function registerResearchQuestionCommandTests(
  harnessValue: () => ApiHarness,
): void {
  it("persists one active grounded question and exposes only its public ledger", async () => {
    // Given
    const harness = harnessValue();
    const run = await createRun(harness, "question-parent");
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

    // When
    const created = await postQuestion(
      harness,
      publication.reportId,
      "question-one",
      { question: "What supports the margin view?", locale: "en" },
    );
    const duplicateActive = await postQuestion(
      harness,
      publication.reportId,
      "question-two",
      { question: "What are the risks?", locale: "en" },
    );
    const detail = await harness.api.handle(
      harness.request(
        `/api/research/questions/${created.question?.questionId}`,
      ),
    );
    const detailBody = await json(detail);

    // Then
    expect([
      created.response.status,
      duplicateActive.response.status,
      detail.status,
    ]).toEqual([202, 409, 200]);
    expect(created.question).toMatchObject({
      attemptOrdinal: 1,
      status: "pending",
    });
    expect(JSON.stringify(detailBody)).not.toMatch(
      /inputHash|artifactDigest|lease|prompt|principal|secret|token/i,
    );
    expect(
      databaseScalar(
        harness,
        "SELECT status FROM runs WHERE run_id = ?",
        run.runId,
      ),
    ).toBe("completed");
    expect(
      databaseScalar(
        harness,
        "SELECT last_event_seq FROM runs WHERE run_id = ?",
        run.runId,
      ),
    ).toBe(highWaterBefore);
    expect(
      databaseScalar(
        harness,
        "SELECT COUNT(*) FROM run_events WHERE run_id = ?",
        run.runId,
      ),
    ).toBe(eventCountBefore);
  });

  it("replays the same question and rejects an idempotency-key conflict", async () => {
    // Given
    const harness = harnessValue();
    const run = await createRun(harness, "question-idempotency-parent");
    const publication = await publishRun(harness, run);
    const body = { question: "Explain the filing evidence", locale: "en" };
    const first = await postQuestion(
      harness,
      publication.reportId,
      "same-question",
      body,
    );

    // When
    const replay = await postQuestion(
      harness,
      publication.reportId,
      "same-question",
      body,
    );
    const conflict = await postQuestion(
      harness,
      publication.reportId,
      "same-question",
      {
        question: "Explain a different claim",
        locale: "en",
      },
    );

    // Then
    expect([
      first.response.status,
      replay.response.status,
      conflict.response.status,
    ]).toEqual([202, 202, 409]);
    expect(replay.body).toEqual(first.body);
    expect(
      databaseScalar(
        harness,
        "SELECT COUNT(*) FROM questions WHERE report_id = ?",
        publication.reportId,
      ),
    ).toBe(1);
  });

  it("creates an explicit failed-answer retry with a new ordinal and immutable predecessor", async () => {
    // Given
    const harness = harnessValue();
    const run = await createRun(harness, "question-retry-parent");
    const publication = await publishRun(harness, run);
    const first = await postQuestion(
      harness,
      publication.reportId,
      "question-failed",
      {
        question: "Explain the claim",
        locale: "en",
      },
    );
    const firstId = first.question?.questionId ?? "";
    failQuestion(harness, firstId);

    // When
    const retry = await postQuestion(
      harness,
      publication.reportId,
      "question-retry",
      {
        question: "Explain the claim",
        locale: "en",
        retryOfQuestionId: firstId,
      },
    );

    // Then
    expect(retry.response.status).toBe(202);
    expect(retry.question).toMatchObject({
      attemptOrdinal: 2,
      status: "pending",
    });
    expect(retry.question?.questionId).not.toBe(firstId);
    expect(
      databaseScalar(
        harness,
        "SELECT status FROM questions WHERE question_id = ?",
        firstId,
      ),
    ).toBe("failed");
  });

  it("burns all twenty question attempts and rejects the twenty-first", async () => {
    // Given
    const harness = harnessValue();
    const run = await createRun(harness, "question-quota-parent");
    const publication = await publishRun(harness, run);
    let latestId = "";
    for (let ordinal = 1; ordinal <= 20; ordinal += 1) {
      const attempt = await postQuestion(
        harness,
        publication.reportId,
        `question-quota-${ordinal}`,
        { question: `Explain claim ${ordinal}`, locale: "en" },
      );
      expect(attempt.question?.attemptOrdinal).toBe(ordinal);
      latestId = attempt.question?.questionId ?? "";
      failQuestion(harness, latestId);
    }

    // When
    const exhausted = await postQuestion(
      harness,
      publication.reportId,
      "question-quota-21",
      { question: "One more", locale: "en" },
    );

    // Then
    expect(exhausted.response.status).toBe(409);
    expect(exhausted.body).toEqual({
      error: { code: "QUESTION_QUOTA_EXHAUSTED" },
    });
    expect(
      databaseScalar(
        harness,
        "SELECT COUNT(*) FROM questions WHERE report_id = ?",
        publication.reportId,
      ),
    ).toBe(20);
  });

  it("directs new facts to follow-up and enforces question bounds and origin", async () => {
    // Given
    const harness = harnessValue();
    const run = await createRun(harness, "question-boundary-parent");
    const publication = await publishRun(harness, run);
    const path = `/api/research/reports/${publication.reportId}/questions`;

    // When
    const current = await postQuestion(
      harness,
      publication.reportId,
      "question-current",
      {
        question: "What is the latest price now?",
        locale: "en",
      },
    );
    const oversized = await postQuestion(
      harness,
      publication.reportId,
      "question-large",
      {
        question: "x".repeat(4_001),
        locale: "en",
      },
    );
    const evil = commandRequest(harness, path, "question-evil", {
      question: "Explain the report",
      locale: "en",
    });
    evil.headers.set("origin", "https://evil.example");
    evil.headers.set("sec-fetch-site", "cross-site");
    const forbidden = await harness.api.handle(evil);

    // Then
    expect(current.body).toEqual({ error: { code: "FOLLOW_UP_REQUIRED" } });
    expect([
      current.response.status,
      oversized.response.status,
      forbidden.status,
    ]).toEqual([409, 400, 403]);
    expect(
      databaseScalar(
        harness,
        "SELECT COUNT(*) FROM questions WHERE report_id = ?",
        publication.reportId,
      ),
    ).toBe(0);
  });
}
