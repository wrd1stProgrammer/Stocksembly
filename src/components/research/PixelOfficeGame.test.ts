import { describe, expect, it } from "vitest";
import type { ResearchEvent } from "../../research/types";
import { concurrentSpeechEvents, speechBubbleMessage } from "./PixelOfficeGame";

function event(
  id: string,
  agent: ResearchEvent["agent"],
  workflowKind: NonNullable<ResearchEvent["workflowKind"]>,
): ResearchEvent {
  return {
    id,
    phase: "analyzing",
    agent,
    workflowKind,
    summary: { en: `${id} summary.`, ko: `${id} 요약.` },
    detail: { en: id, ko: id },
    progress: 40,
  };
}

describe("concurrentSpeechEvents", () => {
  it("keeps up to three distinct speakers from the current parallel stage", () => {
    const events = [
      event("memo-market-1", "market", "specialist_memo_committed"),
      event("memo-company", "company", "specialist_memo_committed"),
      event("memo-market-2", "market", "specialist_memo_committed"),
      event("memo-financial", "financial", "specialist_memo_committed"),
      event("consolidation", "risk", "department_consolidation_committed"),
    ];

    expect(
      concurrentSpeechEvents(events[3], events).map(({ id }) => id),
    ).toEqual(["memo-company", "memo-market-2", "memo-financial"]);
  });

  it("stops a concurrent speaker after its final bounded segment", () => {
    const long: ResearchEvent = {
      ...event("memo-company", "company", "specialist_memo_committed"),
      summary: {
        en: "Compute and Networking generated roughly $193.5B of reported business revenue while future AI-factory capacity remains tied to an OpenAI tenant.",
        ko: "기업 분석 요약입니다.",
      },
    };

    const message = speechBubbleMessage(long, "en", 99);

    expect(message).toBe("");
    expect(speechBubbleMessage(long, "en", 0).length).toBeGreaterThan(46);
  });
});
