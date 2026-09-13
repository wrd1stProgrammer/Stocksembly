import { describe, expect, it } from "vitest";
import { createOfficialAttemptHandler } from "../compositions/officialWorker";
import { createLeaseEngine } from "../worker/leaseEngine";
import {
  createQuestionAnswerFixture,
  QuestionCodexFake,
} from "./questionAnswer.testSupport";

async function runOne(
  options: {
    readonly advancedQuestion?: boolean;
    readonly codex?: QuestionCodexFake;
    readonly externalQuestion?: boolean;
    readonly marketApiEvidence?: boolean;
    readonly reportIdMismatch?: boolean;
  } = {},
) {
  const fixture = await createQuestionAnswerFixture(options);
  const official = await createOfficialAttemptHandler(
    {
      dataDirectory: fixture.root,
      database: fixture.database,
      ownerId: "official-question-worker",
    },
    { cas: fixture.cas, codex: fixture.codex, now: fixture.now },
  );
  const engine = createLeaseEngine({
    pool: fixture.database,
    ownerId: "official-question-worker",
    handler: official.handler,
    clock: { now: fixture.now },
  });
  return { fixture, official, engine };
}

describe("official grounded question answering", () => {
  it("commits one physical spawn and answers only with published claim/source IDs", async () => {
    // Given
    const runtime = await runOne();

    // When
    const handled = await runtime.engine.poll();
    const replay = await runtime.engine.poll();
    const database = runtime.fixture.database;
    const question = (
      await database.query(
        "SELECT status, answer_json FROM questions WHERE question_id = $1",
        [runtime.fixture.questionId],
      )
    ).rows[0] as {
      readonly status: string;
      readonly answer_json: string;
    };
    const counts = (
      await database.query(
        "SELECT\n        (SELECT COUNT(*)::integer FROM question_call_ordinals) AS launches,\n        (SELECT COUNT(*)::integer FROM question_runner_evidence) AS evidence",
        [],
      )
    ).rows[0];

    // Then
    expect(handled).toMatchObject({ kind: "handled", committed: true });
    expect(replay).toEqual({ kind: "idle" });
    expect(runtime.fixture.codex.launches).toBe(1);
    expect(counts).toEqual({ launches: 1, evidence: 1 });
    expect(question.status).toBe("answered");
    expect(JSON.parse(question.answer_json)).toEqual({
      summary: {
        en: "The selected published claim directly answers the question.",
        ko: "선택된 공개 근거가 질문에 직접 답합니다.",
      },
      elements: [
        {
          claimId: runtime.fixture.report.claims[0]?.claimId,
          sourceIds: runtime.fixture.report.claims[0]?.sourceIds,
          text:
            runtime.fixture.report.locales.en.sections[0]?.body === undefined
              ? undefined
              : {
                  en: runtime.fixture.report.locales.en.sections[0].body,
                  ko: runtime.fixture.report.locales.ko.sections[0]?.body,
                },
        },
      ],
      externalSources: [],
    });
    await runtime.engine.shutdown();
    await runtime.official.close();
    runtime.fixture.cleanup();
  });

  it("captures and returns external evidence for a latest-information question", async () => {
    // Given
    const codex = new QuestionCodexFake("external");
    const runtime = await runOne({ codex, externalQuestion: true });

    // When
    const handled = await runtime.engine.poll();
    const database = runtime.fixture.database;
    const question = (
      await database.query(
        "SELECT status, answer_json FROM questions WHERE question_id = $1",
        [runtime.fixture.questionId],
      )
    ).rows[0] as {
      readonly status: string;
      readonly answer_json: string;
    };
    const webEvidence = (
      await database.query(
        "SELECT COUNT(*)::integer AS count FROM attempt_web_evidence",
        [],
      )
    ).rows[0];

    // Then
    expect(handled).toMatchObject({ kind: "handled", committed: true });
    expect(question.status).toBe("answered");
    expect(JSON.parse(question.answer_json)).toMatchObject({
      elements: [],
      externalSources: [
        {
          url: "https://example.com/latest-company-update",
          title: "Latest company update",
          publisher: "Example Exchange",
        },
      ],
    });
    expect(webEvidence).toEqual({ count: 1 });
    await runtime.engine.shutdown();
    await runtime.official.close();
    runtime.fixture.cleanup();
  });

  it("routes advanced consultation questions to the Luna light runtime", async () => {
    // Given
    const codex = new QuestionCodexFake();
    const runtime = await runOne({ advancedQuestion: true, codex });

    // When
    const handled = await runtime.engine.poll();

    // Then
    expect(handled).toMatchObject({ kind: "handled", committed: true });
    expect(codex.runtimeOverrides).toEqual([
      { model: "gpt-5.6-luna", reasoning: "low" },
    ]);
    await runtime.engine.shutdown();
    await runtime.official.close();
    runtime.fixture.cleanup();
  });

  it("binds a no-tool market answer to the supplied licensed API source", async () => {
    // Given
    const codex = new QuestionCodexFake("api_alias");
    const runtime = await runOne({
      advancedQuestion: true,
      codex,
      marketApiEvidence: true,
    });

    // When
    const handled = await runtime.engine.poll();
    const database = runtime.fixture.database;
    const question = (
      await database.query(
        "SELECT answer_json FROM questions WHERE question_id = $1",
        [runtime.fixture.questionId],
      )
    ).rows[0] as { readonly answer_json: string };

    // Then
    expect(handled).toMatchObject({ kind: "handled", committed: true });
    expect(JSON.parse(question.answer_json)).toMatchObject({
      externalSources: [
        {
          url: "https://licensed.example.test/v3/quotes/MSFT",
          publisher: "Licensed market data",
        },
      ],
    });
    await runtime.engine.shutdown();
    await runtime.official.close();
    runtime.fixture.cleanup();
  });

  it("terminalizes an answer that cites a claim outside the accepted report", async () => {
    // Given
    const codex = new QuestionCodexFake("unknown_claim");
    const runtime = await runOne({ codex });

    // When
    const handled = await runtime.engine.poll();
    const replay = await runtime.engine.poll();
    const database = runtime.fixture.database;
    const question = (
      await database.query(
        "SELECT status, answer_json FROM questions WHERE question_id = $1",
        [runtime.fixture.questionId],
      )
    ).rows[0];

    // Then
    expect(handled).toMatchObject({
      kind: "handled",
      committed: true,
      outcome: { kind: "permanent", code: "question_claim_not_published" },
    });
    expect(replay).toEqual({ kind: "idle" });
    expect(codex.launches).toBe(1);
    expect(question).toEqual({ status: "failed", answer_json: null });
    await runtime.engine.shutdown();
    await runtime.official.close();
    runtime.fixture.cleanup();
  });

  it("rejects cross-report artifact binding before spawning", async () => {
    // Given
    const runtime = await runOne({ reportIdMismatch: true });

    // When
    const handled = await runtime.engine.poll();
    const replay = await runtime.engine.poll();

    // Then
    expect(handled).toMatchObject({
      kind: "handled",
      committed: true,
      outcome: { kind: "permanent", code: "question_context_unavailable" },
    });
    expect(replay).toEqual({ kind: "idle" });
    expect(runtime.fixture.codex.launches).toBe(0);
    await runtime.engine.shutdown();
    await runtime.official.close();
    runtime.fixture.cleanup();
  });

  it("burns and terminalizes a timed-out question without relaunch", async () => {
    // Given
    const codex = new QuestionCodexFake("timeout");
    const runtime = await runOne({ codex });

    // When
    const handled = await runtime.engine.poll();
    const replay = await runtime.engine.poll();
    const database = runtime.fixture.database;
    const persisted = (
      await database.query(
        "SELECT questions.status,\n        (SELECT COUNT(*)::integer FROM question_call_ordinals) AS launches\n        FROM questions WHERE question_id = $1",
        [runtime.fixture.questionId],
      )
    ).rows[0];

    // Then
    expect(handled).toMatchObject({
      kind: "handled",
      committed: true,
      outcome: { kind: "permanent", code: "question_timeout" },
    });
    expect(replay).toEqual({ kind: "idle" });
    expect(codex.launches).toBe(1);
    expect(persisted).toEqual({ status: "failed", launches: 1 });
    await runtime.engine.shutdown();
    await runtime.official.close();
    runtime.fixture.cleanup();
  });
});
