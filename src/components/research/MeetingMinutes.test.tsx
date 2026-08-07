import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { agents } from "../../research/mockResearch";
import type { ResearchEvent } from "../../research/types";
import { MeetingMinutes } from "./MeetingMinutes";

vi.mock("thinking-orbs", () => ({
  ThinkingOrb: ({ state, size }: { state: string; size: number }) => (
    <span data-testid="thinking-orb" data-state={state} data-size={size} />
  ),
}));

function event(index: number): ResearchEvent {
  const agent = agents[index % agents.length];
  if (agent === undefined) throw new TypeError("fixture agent missing");
  return {
    id: `event-${index}`,
    phase: "analyzing",
    agent: agent.id,
    summary: {
      en: `Public memo ${index}. Supporting detail ${index}.`,
      ko: `공개 메모 ${index}. 보조 설명 ${index}.`,
    },
    detail: {
      en: `Committed event #${index}`,
      ko: `커밋 이벤트 #${index}`,
    },
    progress: index,
  };
}

describe("MeetingMinutes", () => {
  it("preserves the full event history and hides persistence diagnostics", () => {
    const events = Array.from({ length: 14 }, (_, index) => event(index + 1));
    const current = events.at(-1);
    if (current === undefined) throw new TypeError("current event missing");
    render(
      <MeetingMinutes
        current={current}
        agents={agents}
        events={events}
        locale="en"
        isComplete={false}
        reportVersion={1}
      />,
    );
    expect(document.querySelectorAll("[data-event-id]")).toHaveLength(14);
    expect(screen.getByText("Public memo 1.")).toBeInTheDocument();
    expect(screen.getByText("Public memo 14.")).toBeInTheDocument();
    expect(screen.queryByText(/Committed event/)).not.toBeInTheDocument();
  });

  it("renders multi-agent rebuttals as one named conversation", () => {
    // Given
    const [challenger, respondent] = agents;
    if (challenger === undefined || respondent === undefined) {
      throw new TypeError("debate agents missing");
    }
    const debate: ResearchEvent = {
      ...event(1),
      phase: "challenging",
      agent: challenger.id,
      workflowKind: "challenge_committed",
      participantIds: [challenger.id, respondent.id],
    };

    // When
    render(
      <MeetingMinutes
        current={debate}
        agents={agents}
        events={[debate]}
        locale="ko"
        isComplete={false}
        reportVersion={1}
      />,
    );

    // Then
    const conversation = document.querySelector('[data-event-id="event-1"]');
    expect(conversation).toHaveAttribute("data-collaborative", "true");
    expect(conversation).toHaveTextContent(challenger.name.ko);
    expect(conversation).toHaveTextContent(respondent.name.ko);
    expect(conversation?.querySelectorAll("img")).toHaveLength(2);
    expect(conversation).toHaveTextContent("반론");
  });

  it("keeps the completed-panel tabs visible while research is active and locks chat", () => {
    const active = event(1);

    render(
      <MeetingMinutes
        current={active}
        agents={agents}
        events={[active]}
        locale="ko"
        isComplete={false}
        reportVersion={1}
      />,
    );

    expect(screen.getByRole("button", { name: "회의록" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "채팅" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "채팅" })).toHaveAttribute(
      "title",
      "리서치 완료 후 이용할 수 있습니다",
    );
  });

  it("shows Dr. Park thinking only while the backend marks the chair job active", () => {
    const audit: ResearchEvent = {
      ...event(1),
      phase: "auditing",
      agent: "chair",
      workflowKind: "structural_audit_completed",
    };

    const { rerender } = render(
      <MeetingMinutes
        current={audit}
        agents={agents}
        events={[audit]}
        locale="ko"
        isComplete={false}
        pendingAgentIds={["chair"]}
        reportVersion={1}
      />,
    );

    expect(
      screen.getByRole("status", {
        name: "박 의장 에이전트가 데이터와 AI 응답을 검토하고 있습니다",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("thinking-orb")).toHaveAttribute(
      "data-state",
      "solving",
    );
    expect(
      document.querySelectorAll(".text-shimmer-wave__character"),
    ).toHaveLength("분석 중...".length);

    rerender(
      <MeetingMinutes
        current={audit}
        agents={agents}
        events={[audit]}
        locale="ko"
        isComplete={false}
        pendingAgentIds={[]}
        reportVersion={1}
      />,
    );

    expect(
      screen.queryByRole("status", {
        name: "박 의장 에이전트가 데이터와 AI 응답을 검토하고 있습니다",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows focused-team agents thinking while their response is pending", () => {
    const active = event(1);
    const agent = agents.find((profile) => profile.id === active.agent);
    if (agent === undefined) throw new TypeError("active agent missing");

    render(
      <MeetingMinutes
        current={active}
        agents={[agent]}
        events={[active]}
        locale="ko"
        isComplete={false}
        pendingAgentIds={[agent.id]}
        reportVersion={1}
      />,
    );

    expect(
      screen.getByRole("status", {
        name: `${agent.name.ko} 에이전트가 데이터와 AI 응답을 검토하고 있습니다`,
      }),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-agent-thinking]")).toHaveAttribute(
      "data-agent-thinking",
      agent.id,
    );
  });
});
