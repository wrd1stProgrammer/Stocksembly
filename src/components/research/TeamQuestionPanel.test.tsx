import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchClient } from "../../research/client/api";
import type { PublicQuestion } from "../../research/client/schemas";
import { fixtureData } from "../../research/compositions/fixture";
import { GroundedAnswerSchema } from "../../research/domain/question";
import { TeamQuestionPanel } from "./TeamQuestionPanel";

vi.mock("border-beam", () => ({
  BorderBeam: ({
    children,
    className,
    colorVariant,
    size,
    strength,
  }: {
    readonly children: ReactNode;
    readonly className: string;
    readonly colorVariant: string;
    readonly size: string;
    readonly strength: number;
  }) => (
    <div
      className={className}
      data-color-variant={colorVariant}
      data-size={size}
      data-strength={strength}
    >
      {children}
    </div>
  ),
}));

vi.mock("thinking-orbs", () => ({
  ThinkingOrb: ({
    size,
    state,
  }: {
    readonly size: number;
    readonly state: string;
  }) => <span data-testid="thinking-orb" data-size={size} data-state={state} />,
}));

describe("TeamQuestionPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns published report evidence for the selected specialist", async () => {
    // Given
    const pending = {
      questionId: "00000000-0000-4000-8000-000000000010",
      reportId: "00000000-0000-4000-8000-000000000011",
      reportVersionId: "00000000-0000-4000-8000-000000000012",
      attemptOrdinal: 1,
      status: "pending",
      activity: "thinking",
      question: { en: "encoded consultation", ko: "encoded consultation" },
      createdAt: "2026-07-27T00:00:00.000Z",
    } satisfies PublicQuestion;
    const answered = {
      ...pending,
      status: "answered",
      answer: GroundedAnswerSchema.parse({
        elements: [
          {
            claimId: "00000000-0000-4000-8000-000000000013",
            sourceIds: ["00000000-0000-4000-8000-000000000014"],
            text: {
              en: "Demanding expectations remain the largest downside condition.",
              ko: "높은 기대치가 가장 큰 하방 조건으로 남아 있습니다.",
            },
          },
        ],
      }),
    } satisfies PublicQuestion;
    const questionClient = {
      askQuestion: vi.fn().mockResolvedValue(pending),
      getQuestion: vi.fn().mockResolvedValue(answered),
    } satisfies Pick<ResearchClient, "askQuestion" | "getQuestion">;
    render(
      <TeamQuestionPanel
        agents={fixtureData.agents}
        locale="en"
        reportId={pending.reportId}
        reportVersion={1}
        questionClient={questionClient}
      />,
    );

    // When
    fireEvent.change(screen.getByLabelText("Specialist"), {
      target: { value: "risk" },
    });
    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "What could break the base case?" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Advanced reasoning" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    // Then
    expect(screen.getByText("What could break the base case?")).toBeVisible();
    const thinkingStatus = screen.getByRole("status", {
      name: "Composing answer",
    });
    expect(thinkingStatus).toHaveTextContent("Thinking...");
    expect(thinkingStatus).toHaveAttribute("data-activity", "thinking");
    expect(screen.getByTestId("thinking-orb")).toHaveAttribute(
      "data-state",
      "solving",
    );
    expect(screen.getByTestId("thinking-orb")).toHaveAttribute(
      "data-size",
      "20",
    );
    expect(screen.getByTestId("thinking-orb").parentElement).toHaveClass(
      "team-question-panel__status-orb",
    );
    expect(
      document.querySelectorAll(".text-shimmer-wave__character"),
    ).toHaveLength("Thinking...".length);
    await waitFor(() =>
      expect(
        screen.getAllByText(
          "Demanding expectations remain the largest downside condition.",
        ),
      ).not.toHaveLength(0),
    );
    expect(screen.queryByText(/Research File v1\.0/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Research consultation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Question").closest(".team-question-panel__beam"),
    ).toHaveAttribute("data-strength", "0.99");
    expect(questionClient.askQuestion).toHaveBeenCalledOnce();
    expect(questionClient.askQuestion.mock.calls[0]?.[0].question).toContain(
      '"advancedReasoning":true',
    );
    expect(screen.getByRole("option", { name: "Liam" })).toBeInTheDocument();
    expect(screen.queryByText("Risk Lead")).not.toBeInTheDocument();
    expect(questionClient.getQuestion).toHaveBeenCalledWith(pending.questionId);
  });

  it("shows a searching orb for a question that requires current information", async () => {
    // Given
    const pending = {
      questionId: "00000000-0000-4000-8000-000000000030",
      reportId: "00000000-0000-4000-8000-000000000031",
      reportVersionId: "00000000-0000-4000-8000-000000000032",
      attemptOrdinal: 1,
      status: "pending",
      activity: "searching",
      question: { en: "latest news", ko: "최신 뉴스" },
      createdAt: "2026-07-27T00:00:00.000Z",
    } satisfies PublicQuestion;
    const questionClient = {
      askQuestion: vi.fn().mockResolvedValue(pending),
      getQuestion: vi.fn().mockReturnValue(new Promise(() => undefined)),
    } satisfies Pick<ResearchClient, "askQuestion" | "getQuestion">;
    render(
      <TeamQuestionPanel
        agents={fixtureData.agents}
        locale="ko"
        reportId={pending.reportId}
        reportVersion={1}
        questionClient={questionClient}
      />,
    );

    // When
    fireEvent.change(screen.getByLabelText("질문"), {
      target: { value: "오늘 나온 최신 뉴스를 검색해줘" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));

    // Then
    const searchingStatus = screen.getByRole("status", {
      name: "외부 근거 검색 중",
    });
    expect(searchingStatus).toHaveTextContent("Searching...");
    expect(searchingStatus).toHaveAttribute("data-activity", "searching");
    expect(screen.getByTestId("thinking-orb")).toHaveAttribute(
      "data-state",
      "searching",
    );
  });

  it("retries one failed consultation before showing an error", async () => {
    const failed = {
      questionId: "00000000-0000-4000-8000-000000000020",
      reportId: "00000000-0000-4000-8000-000000000021",
      reportVersionId: "00000000-0000-4000-8000-000000000022",
      attemptOrdinal: 1,
      status: "failed",
      activity: "thinking",
      question: { en: "consultation", ko: "consultation" },
      createdAt: "2026-07-27T00:00:00.000Z",
    } satisfies PublicQuestion;
    const answered = {
      ...failed,
      questionId: "00000000-0000-4000-8000-000000000023",
      attemptOrdinal: 2,
      status: "answered",
      answer: GroundedAnswerSchema.parse({
        elements: [
          {
            claimId: "00000000-0000-4000-8000-000000000024",
            sourceIds: ["00000000-0000-4000-8000-000000000025"],
            text: {
              en: "The retry returned grounded evidence.",
              ko: "재시도에서 근거 답변을 반환했습니다.",
            },
          },
        ],
      }),
    } satisfies PublicQuestion;
    const questionClient = {
      askQuestion: vi
        .fn()
        .mockResolvedValueOnce(failed)
        .mockResolvedValueOnce(answered),
      getQuestion: vi.fn(),
    } satisfies Pick<ResearchClient, "askQuestion" | "getQuestion">;
    render(
      <TeamQuestionPanel
        agents={fixtureData.agents}
        locale="ko"
        reportId={failed.reportId}
        reportVersion={1}
        questionClient={questionClient}
      />,
    );

    fireEvent.change(screen.getByLabelText("질문"), {
      target: { value: "판단을 바꿀 조건은?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));

    await waitFor(() =>
      expect(
        screen.getAllByText("재시도에서 근거 답변을 반환했습니다."),
      ).not.toHaveLength(0),
    );
    expect(questionClient.askQuestion).toHaveBeenCalledTimes(2);
    expect(questionClient.askQuestion.mock.calls[1]?.[0]).toMatchObject({
      retryOfQuestionId: failed.questionId,
    });
  });

  it("restores answered consultation messages after the panel remounts", async () => {
    // Given
    const answered = {
      questionId: "00000000-0000-4000-8000-000000000040",
      reportId: "00000000-0000-4000-8000-000000000041",
      reportVersionId: "00000000-0000-4000-8000-000000000042",
      attemptOrdinal: 1,
      status: "answered",
      activity: "thinking",
      question: { en: "encoded consultation", ko: "encoded consultation" },
      answer: GroundedAnswerSchema.parse({
        summary: {
          en: "Persistent grounded answer.",
          ko: "저장되는 근거 답변입니다.",
        },
        elements: [
          {
            claimId: "00000000-0000-4000-8000-000000000043",
            sourceIds: ["00000000-0000-4000-8000-000000000044"],
            text: {
              en: "Persistent evidence.",
              ko: "저장되는 근거입니다.",
            },
          },
        ],
      }),
      createdAt: "2026-07-27T00:00:00.000Z",
    } satisfies PublicQuestion;
    const questionClient = {
      askQuestion: vi.fn().mockResolvedValue(answered),
      getQuestion: vi.fn(),
    } satisfies Pick<ResearchClient, "askQuestion" | "getQuestion">;
    const first = render(
      <TeamQuestionPanel
        agents={fixtureData.agents}
        locale="ko"
        reportId={answered.reportId}
        reportVersion={1}
        questionClient={questionClient}
      />,
    );
    fireEvent.change(screen.getByLabelText("질문"), {
      target: { value: "기억할 질문" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));
    await waitFor(() =>
      expect(screen.getByText("저장되는 근거 답변입니다.")).toBeVisible(),
    );
    first.unmount();

    // When
    render(
      <TeamQuestionPanel
        agents={fixtureData.agents}
        locale="ko"
        reportId={answered.reportId}
        reportVersion={1}
        questionClient={questionClient}
      />,
    );

    // Then
    expect(screen.getByText("기억할 질문")).toBeVisible();
    expect(screen.getByText("저장되는 근거 답변입니다.")).toBeVisible();
  });

  it("passes the previous answer claim lineage into a follow-up question", async () => {
    // Given
    const firstAnswer = {
      questionId: "00000000-0000-4000-8000-000000000050",
      reportId: "00000000-0000-4000-8000-000000000051",
      reportVersionId: "00000000-0000-4000-8000-000000000052",
      attemptOrdinal: 1,
      status: "answered",
      activity: "thinking",
      question: { en: "first", ko: "first" },
      answer: GroundedAnswerSchema.parse({
        summary: { en: "First answer.", ko: "첫 답변입니다." },
        elements: [
          {
            claimId: "00000000-0000-4000-8000-000000000053",
            sourceIds: ["00000000-0000-4000-8000-000000000054"],
            text: { en: "First evidence.", ko: "첫 근거입니다." },
          },
        ],
      }),
      createdAt: "2026-07-27T00:00:00.000Z",
    } satisfies PublicQuestion;
    const secondAnswer = {
      ...firstAnswer,
      questionId: "00000000-0000-4000-8000-000000000055",
      attemptOrdinal: 2,
      answer: GroundedAnswerSchema.parse({
        summary: { en: "Follow-up answer.", ko: "후속 답변입니다." },
        elements: [],
        externalSources: [
          {
            url: "https://example.com/follow-up",
            title: "Follow-up",
            publisher: "Example",
            retrievedAt: "2026-07-27T00:01:00.000Z",
            excerpt: "Current follow-up evidence.",
          },
        ],
      }),
    } satisfies PublicQuestion;
    const questionClient = {
      askQuestion: vi
        .fn()
        .mockResolvedValueOnce(firstAnswer)
        .mockResolvedValueOnce(secondAnswer),
      getQuestion: vi.fn(),
    } satisfies Pick<ResearchClient, "askQuestion" | "getQuestion">;
    render(
      <TeamQuestionPanel
        agents={fixtureData.agents}
        locale="ko"
        reportId={firstAnswer.reportId}
        reportVersion={1}
        questionClient={questionClient}
      />,
    );
    fireEvent.change(screen.getByLabelText("질문"), {
      target: { value: "첫 질문" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));
    await waitFor(() =>
      expect(screen.getByText("첫 답변입니다.")).toBeVisible(),
    );

    // When
    fireEvent.change(screen.getByLabelText("질문"), {
      target: { value: "그 근거를 자세히 설명해줘" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));
    await waitFor(() =>
      expect(questionClient.askQuestion).toHaveBeenCalledTimes(2),
    );

    // Then
    const secondPayload = JSON.parse(
      questionClient.askQuestion.mock.calls[1]?.[0].question ?? "{}",
    );
    expect(secondPayload.conversation).toContainEqual(
      expect.objectContaining({
        role: "assistant",
        claimIds: ["00000000-0000-4000-8000-000000000053"],
        sourceIds: ["00000000-0000-4000-8000-000000000054"],
      }),
    );
  });
});
