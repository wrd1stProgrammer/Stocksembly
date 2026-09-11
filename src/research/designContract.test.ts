import { describe, expect, it } from "vitest";
import {
  OFFICE_BEAT_SCHEDULE,
  OFFICE_CLOCK_CONTRACT,
  officeBeatAt,
} from "./officeChoreographyV7Contract";
import { OFFICE_PUBLIC_EVENTS } from "./officeChoreographyV7Events";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

const SPECIALIST_IDS =
  "market,market_news,company,company_product,company_competition,financial,valuation,financial_quality,risk,risk_policy".split(
    ",",
  );
const EXPECTED_BOUNDARIES = JSON.parse(
  '[{"id":"briefing","startTick":0,"endTick":39},{"id":"parallel-work","startTick":40,"endTick":239},{"id":"department-talk","startTick":240,"endTick":359},{"id":"visit-wave-a","startTick":360,"endTick":639},{"id":"return-a","startTick":640,"endTick":719},{"id":"visit-wave-b","startTick":720,"endTick":999},{"id":"return-b","startTick":1000,"endTick":1079},{"id":"representative-gathering","startTick":1080,"endTick":1299},{"id":"forum","startTick":1300,"endTick":1579},{"id":"complete","startTick":1580,"endTick":1580}]',
);
const PUBLIC_KINDS =
  "checkpoint,complete,gathering,handoff,mandate,presentation,progress,summary,synthesis".split(
    ",",
  );
describe("live research design contract baseline", () => {
  it("preserves the authored world and canonical roster", () => {
    // Given
    const rosterIds = OFFICE_SCENE_MANIFEST.roster.map((member) => member.id);
    // When
    const chair = OFFICE_SCENE_MANIFEST.roster.find(
      (member) => member.id === "chair",
    );
    // Then
    expect(OFFICE_SCENE_MANIFEST.world).toMatchObject({
      width: 1374,
      height: 1145,
      cellSize: 32,
      columns: 43,
      rows: 35,
    });
    expect(rosterIds).toEqual([...SPECIALIST_IDS, "chair"]);
    expect(chair?.name).toEqual({ en: "Dr. Park", ko: "박 의장" });
  });

  it("keeps one 50ms fixed clock and the existing beat boundaries", () => {
    // Given
    const boundaries = OFFICE_BEAT_SCHEDULE.map(
      ({ id, startTick, endTick }) => ({ id, startTick, endTick }),
    );
    // When / Then
    expect(OFFICE_CLOCK_CONTRACT).toMatchObject({
      tickMs: 50,
      completeTick: 1580,
      maxCatchUpTicks: 5,
      maxFrameDeltaMs: 250,
    });
    expect(boundaries).toEqual(EXPECTED_BOUNDARIES);
    expect(officeBeatAt(1580).id).toBe("complete");
  });

  it("keeps public choreography structural and free of private reasoning fields", () => {
    // Given / When
    const invalidEvents = OFFICE_PUBLIC_EVENTS.filter((event) => {
      const keys = Object.keys(event).sort();
      return (
        !PUBLIC_KINDS.includes(event.kind) ||
        JSON.stringify(keys) !==
          JSON.stringify(["id", "kind", "participantIds", "tick"])
      );
    });
    // Then
    expect(invalidEvents).toEqual([]);
  });
});
