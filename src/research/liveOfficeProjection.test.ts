import { describe, expect, it } from "vitest";
import type { PublicResearchEvent, PublicRunDetail } from "./client/schemas";
import { liveOfficeProjection } from "./liveOfficeProjection";

const run: PublicRunDetail["run"] = {
  runId: "00000000-0000-4000-8000-000000000001",
  snapshotId: "00000000-0000-4000-8000-000000000002",
  symbol: "AAPL",
  locale: "ko",
  status: "running",
  lastEventSeq: 2,
  createdAt: "2026-08-06T16:00:00.000Z",
};

function collectionStarted(sequence: number): PublicResearchEvent {
  return {
    sequence,
    kind: "collection_started",
    occurredAt: `2026-08-06T16:00:0${sequence}.000Z`,
    stateId: "collection_started",
    summary: {
      en: "Official SEC and macro evidence collection started.",
      ko: "SEC 및 공식 거시경제 근거 수집을 시작했습니다.",
    },
    participantIds: [],
    claimIds: [],
    sourceIds: [],
    limitationIds: [],
  };
}

describe("liveOfficeProjection", () => {
  it("collapses collection retry noise into one visible meeting entry", () => {
    const projection = liveOfficeProjection({
      run,
      events: [collectionStarted(1), collectionStarted(2)],
    });

    expect(
      projection.events.filter(
        (event) => event.workflowKind === "collection_started",
      ),
    ).toHaveLength(1);
  });
});
