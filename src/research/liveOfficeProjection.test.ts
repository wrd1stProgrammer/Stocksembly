import { describe, expect, it } from "vitest";
import type { PublicResearchEvent, PublicRunDetail } from "./client/schemas";
import { createLiveOfficeFrame } from "./liveOfficeAnimation";
import { liveOfficeProjection } from "./liveOfficeProjection";
import { officeSimulationSnapshot } from "./officeSimulation";

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
      en: "Collecting SEC filings, market, news, and macroeconomic data while verifying sources and reference times.",
      ko: "SEC 공시와 시세·뉴스·거시경제 데이터를 수집하고, 출처와 기준 시각을 확인하고 있습니다.",
    },
    participantIds: [],
    claimIds: [],
    sourceIds: [],
    limitationIds: [],
  };
}

function committed(
  sequence: number,
  kind: PublicResearchEvent["kind"],
  actorId: string,
  participantIds: readonly string[],
): PublicResearchEvent {
  return {
    sequence,
    kind,
    occurredAt: `2026-08-06T16:01:${String(sequence).padStart(2, "0")}.000Z`,
    stateId: kind,
    actorId,
    summary: {
      en: `${kind} by ${actorId}`,
      ko: `${actorId} ${kind}`,
    },
    participantIds,
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

  it("keeps agents at their desks until a committed cross-team exchange exists", () => {
    // Given
    const events: PublicResearchEvent[] = [collectionStarted(1)];
    for (let index = 0; index < 11; index += 1) {
      events.push(
        committed(events.length + 1, "specialist_memo_committed", "market", [
          "market",
        ]),
      );
    }
    for (const actorId of ["market", "company", "financial", "risk"]) {
      events.push(
        committed(
          events.length + 1,
          "department_consolidation_committed",
          actorId,
          [actorId],
        ),
      );
    }

    // When
    const beforeChallenge = liveOfficeProjection({ run, events });
    const withChallenge = liveOfficeProjection({
      run,
      events: [
        ...events,
        committed(events.length + 1, "challenge_committed", "market", [
          "market",
          "financial",
        ]),
      ],
    });

    // Then
    expect(beforeChallenge.tick).toBeLessThan(360);
    expect(withChallenge.tick).toBeGreaterThanOrEqual(500);
  });

  it("lands every durable exchange on a settled frame instead of a walking loop", () => {
    // Given
    const events: PublicResearchEvent[] = [collectionStarted(1)];
    for (const actorId of ["market", "company", "financial", "risk"]) {
      events.push(
        committed(
          events.length + 1,
          "department_consolidation_committed",
          actorId,
          [actorId],
        ),
      );
    }
    for (const actorId of ["market", "company", "financial", "risk"]) {
      events.push(
        committed(events.length + 1, "challenge_committed", actorId, [actorId]),
      );
    }
    for (const actorId of ["market", "company", "financial", "risk"]) {
      events.push(
        committed(events.length + 1, "owner_response_committed", actorId, [
          actorId,
        ]),
      );
    }

    // When
    const projection = liveOfficeProjection({ run, events });
    const snapshot = officeSimulationSnapshot(
      createLiveOfficeFrame(projection.tick).simulation,
    );

    // Then
    expect(
      snapshot.actors.filter((actor) =>
        ["stand", "walk", "return", "orient"].includes(actor.action),
      ),
    ).toEqual([]);
  });
});
