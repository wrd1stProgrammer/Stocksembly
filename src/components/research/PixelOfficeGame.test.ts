import { describe, expect, it } from "vitest";
import type { ResearchEvent } from "../../research/types";
import { concurrentSpeechEvents } from "./PixelOfficeGame";

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
});
