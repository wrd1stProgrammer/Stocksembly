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
  it("keeps all ten ranked questions visible with answers available on demand", () => {
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
    const details = container.querySelectorAll("details");
    expect(details).toHaveLength(10);
    expect(details[0]?.open).toBe(false);
    details[0]?.setAttribute("open", "");
    expect(screen.getByText("Persisted answer 1")).toBeVisible();
  });

  it("shows supported answers even when fewer than five exist", () => {
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
    expect(container.querySelectorAll("article")).toHaveLength(4);
    expect(screen.getByText("Persisted question 4")).toBeVisible();
  });
});
