import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { agents } from "../../research/mockResearch";
import type { ResearchEvent } from "../../research/types";
import { MeetingMinutes } from "./MeetingMinutes";

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
});
