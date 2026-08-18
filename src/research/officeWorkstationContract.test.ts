import { describe, expect, it } from "vitest";
import { furnitureStatesForSnapshot } from "./officeGameFurniture";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import {
  createOfficeSimulation,
  officeSimulationSnapshot,
  stepOfficeSimulation,
} from "./officeSimulation";

function snapshotAt(tick: number) {
  let simulation = createOfficeSimulation();
  while (simulation.tick < tick) simulation = stepOfficeSimulation(simulation);
  return officeSimulationSnapshot(simulation);
}

describe("office personal workstation contract", () => {
  it("keeps individual research at personal PCs before moving to team tables", () => {
    // Given
    const individualResearch = snapshotAt(80);
    const teamConsensus = snapshotAt(340);

    // When / Then
    for (const member of OFFICE_SCENE_MANIFEST.roster) {
      const individual = individualResearch.actors.find(
        (actor) => actor.id === member.id,
      );
      const consensus = teamConsensus.actors.find(
        (actor) => actor.id === member.id,
      );
      expect(individual?.cell).toEqual(member.workSeat.cell);
      expect(consensus?.cell).toEqual(member.meetingSeat.cell);
      expect(consensus?.action).toBe(
        member.departmentId === "chair"
          ? "idle"
          : member.representative
            ? "talk"
            : "listen",
      );
    }
  });

  it("renders one generated personal table for every analyst", () => {
    // Given
    const individualResearch = snapshotAt(80);

    // When
    const workstationStates = furnitureStatesForSnapshot(
      individualResearch,
    ).filter((state) => state.purpose === "workstation");

    // Then
    expect(workstationStates).toHaveLength(11);
    expect(workstationStates.every((state) => state.seats.length === 1)).toBe(
      true,
    );
    expect(
      workstationStates.every(
        (state) =>
          state.assetPath ===
          "/research/office-v9/entities/workstation-single-table.png",
      ),
    ).toBe(true);
    expect(
      workstationStates
        .flatMap((state) => state.seats)
        .every((seat) => seat.occupied),
    ).toBe(true);
    expect(
      workstationStates
        .flatMap((state) => state.seats)
        .every((seat) => seat.facing === "down"),
    ).toBe(true);
    expect(
      workstationStates.every((state) => {
        const furniture = OFFICE_SCENE_MANIFEST.furniture.find(
          (item) => item.id === state.id,
        );
        if (!furniture) return false;
        const room = OFFICE_SCENE_MANIFEST.rooms[furniture.roomId];
        return (
          state.position.y >
          ((room.bounds.min.y + room.bounds.max.y + 1) / 2) *
            OFFICE_SCENE_MANIFEST.world.cellSize
        );
      }),
    ).toBe(true);
  });

  it("vacates personal chairs and occupies team chairs during consensus", () => {
    // Given
    const teamConsensus = snapshotAt(340);

    // When
    const states = furnitureStatesForSnapshot(teamConsensus);
    const workSeats = states
      .filter((state) => state.purpose === "workstation")
      .flatMap((state) => state.seats);
    const meetingSeats = states
      .filter((state) => state.purpose === "meeting")
      .flatMap((state) => state.seats);

    // Then
    expect(workSeats.every((seat) => !seat.occupied)).toBe(true);
    expect(meetingSeats.every((seat) => seat.occupied)).toBe(true);
  });

  it("keeps personal chair rows visually clear of meeting chair rows", () => {
    for (const member of OFFICE_SCENE_MANIFEST.roster) {
      if (member.departmentId === "chair") continue;
      expect(
        Math.abs(member.workSeat.cell.y - member.meetingSeat.cell.y),
      ).toBeGreaterThanOrEqual(2);
    }
  });
});
