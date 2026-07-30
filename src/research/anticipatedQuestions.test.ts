import { describe, expect, it } from "vitest";
import { buildAnticipatedQuestions } from "./anticipatedQuestions";
import { teamReportPreviewFixture } from "./teamReportPreviewFixture";

describe("anticipated report questions", () => {
  it("builds ten focused questions for a department report", () => {
    const questions = buildAnticipatedQuestions(
      teamReportPreviewFixture("market"),
    );

    expect(questions).toHaveLength(10);
    expect(
      new Set(questions.map((question) => question.question.ko)).size,
    ).toBe(10);
    expect(new Set(questions.map((question) => question.answer.ko)).size).toBe(
      10,
    );
    expect(
      questions.every(
        (question) =>
          question.answer.en.length > 0 && question.answer.ko.length > 0,
      ),
    ).toBe(true);
  });

  it("changes the question set with the selected team", () => {
    const market = buildAnticipatedQuestions(
      teamReportPreviewFixture("market"),
    );
    const financial = buildAnticipatedQuestions(
      teamReportPreviewFixture("financial"),
    );

    expect(market[0]?.question.ko).not.toBe(financial[0]?.question.ko);
  });
});
