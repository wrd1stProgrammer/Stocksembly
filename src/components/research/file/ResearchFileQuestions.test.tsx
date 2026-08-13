import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fixtureData } from "../../../research/compositions/fixture";
import { ResearchFileQuestions } from "./ResearchFileQuestions";

function persistedQuestions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `question-${index + 1}`,
    question: {
      en: `Persisted question ${index + 1}`,
      ko: `저장된 질문 ${index + 1}`,
    },
    answer: {
      en: `Persisted answer ${index + 1}`,
      ko: `저장된 답변 ${index + 1}`,
    },
    rank: index + 1,
  }));
}

describe("ResearchFileQuestions persisted workflow-v2 presentation", () => {
  it("shows all ten ranked investor questions without a disclosure control", () => {
    // Given
    const file = {
      ...fixtureData.report,
      presentationVersion: "workflow-v2" as const,
      anticipatedQuestions: persistedQuestions(10),
    };

    // When
    const { container } = render(
      <ResearchFileQuestions file={file} locale="en" />,
    );

    // Then
    expect(screen.getByText("Persisted question 1")).toBeVisible();
    expect(screen.getByText("Persisted question 6")).toBeVisible();
    expect(screen.getByText("Persisted question 10")).toBeVisible();
    expect(
      container.querySelectorAll(":scope > section > div > article"),
    ).toHaveLength(10);
    expect(container.querySelector("details")).toBeNull();
  });

  it("omits the module when fewer than five persisted answers are supported", () => {
    // Given
    const file = {
      ...fixtureData.report,
      presentationVersion: "workflow-v2" as const,
      anticipatedQuestions: persistedQuestions(4),
    };

    // When
    const { container } = render(
      <ResearchFileQuestions file={file} locale="en" />,
    );

    // Then
    expect(container).toBeEmptyDOMElement();
  });
});
