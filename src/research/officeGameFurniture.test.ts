import { describe, expect, it } from "vitest";
import {
  furnitureStatesForSnapshot,
  WORKSTATION_TABLE_VISUAL_OFFSET_Y,
  workstationSeatVisualPosition,
} from "./officeGameFurniture";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import {
  createOfficeSimulation,
  type OfficeActorSnapshot,
  type OfficeSimulationSnapshot,
  officeSimulationSnapshot,
  stepOfficeSimulation,
} from "./officeSimulation";

function snapshotAt(tick: number): OfficeSimulationSnapshot {
  let simulation = createOfficeSimulation();
  while (simulation.tick < tick) simulation = stepOfficeSimulation(simulation);
  return officeSimulationSnapshot(simulation);
}

function updateActor(
  snapshot: OfficeSimulationSnapshot,
  actorId: OfficeActorSnapshot["id"],
  update: (actor: OfficeActorSnapshot) => OfficeActorSnapshot,
): OfficeSimulationSnapshot {
  return Object.freeze({
    ...snapshot,
    actors: Object.freeze(
      snapshot.actors.map((actor) =>
        actor.id === actorId ? Object.freeze(update(actor)) : actor,
      ),
    ),
  });
}

describe("office snapshot furniture", () => {
  it("keeps the chair in the world while its occupancy state changes", () => {
    // Given
    // Tick 40 is now the beginning of the visible team entrance.  Use the
    // settled parallel-work beat so this test exercises an occupied seat,
    // rather than an actor still walking in from the entry corridor.
    const seated = snapshotAt(200);
    const standing = updateActor(seated, "market", (actor) => ({
      ...actor,
      action: "stand",
    }));

    // When
    const before = furnitureStatesForSnapshot(seated);
    const after = furnitureStatesForSnapshot(standing);
    const mayaBefore = before
      .flatMap((state) => state.seats)
      .find((seat) => seat.actorId === "market");
    const mayaAfter = after
      .flatMap((state) => state.seats)
      .find((seat) => seat.actorId === "market");

    // Then
    expect(mayaBefore?.occupied).toBe(true);
    expect(mayaAfter?.occupied).toBe(false);
    expect(mayaAfter?.position).toEqual(mayaBefore?.position);
  });

  it("leaves seven personal seats occupied when five representatives reach the forum", () => {
    // Given
    const complete = snapshotAt(1580);

    // When
    const seats = furnitureStatesForSnapshot(complete).flatMap(
      (state) => state.seats,
    );

    // Then
    expect(seats.filter((seat) => seat.occupied)).toHaveLength(7);
    expect(seats.filter((seat) => !seat.occupied)).toHaveLength(16);
  });

  it("derives sixteen furniture clusters and both seat modes per analyst", () => {
    // Given
    const snapshot = snapshotAt(40);

    // When
    const states = furnitureStatesForSnapshot(snapshot);
    const seats = states.flatMap((state) => state.seats);

    // Then
    expect(states).toHaveLength(OFFICE_SCENE_MANIFEST.furniture.length);
    expect(seats).toHaveLength(23);
    expect(states.every((state) => state.size.width > state.size.height)).toBe(
      true,
    );
    expect(
      states.every((state) => {
        const maxWidthCells = state.purpose === "workstation" ? 3 : 7;
        const maxHeightCells = state.purpose === "workstation" ? 2 : 3;
        return (
          state.size.width <=
            OFFICE_SCENE_MANIFEST.world.cellSize * maxWidthCells &&
          state.size.height <=
            OFFICE_SCENE_MANIFEST.world.cellSize * maxHeightCells
        );
      }),
    ).toBe(true);
  });

  it("keeps one personal chair tight to each lowered workstation module", () => {
    const states = furnitureStatesForSnapshot(snapshotAt(40));

    for (const furniture of OFFICE_SCENE_MANIFEST.furniture.filter(
      (candidate) => candidate.purpose === "workstation",
    )) {
      const state = states.find((candidate) => candidate.id === furniture.id);
      if (!state) throw new Error(`Missing furniture state ${furniture.id}`);
      const member = OFFICE_SCENE_MANIFEST.roster.find(
        (candidate) => candidate.id === furniture.memberId,
      );
      if (!member) throw new Error(`Missing member ${furniture.memberId}`);
      const rawTableCenterY =
        ((furniture.footprint.min.y + furniture.footprint.max.y + 1) *
          OFFICE_SCENE_MANIFEST.world.cellSize) /
        2;

      expect(state.seats).toHaveLength(1);
      expect(state.position.y).toBe(
        rawTableCenterY + WORKSTATION_TABLE_VISUAL_OFFSET_Y,
      );
      const seat = state.seats[0];
      const expectedPosition = workstationSeatVisualPosition(member.id);
      if (!expectedPosition) {
        throw new Error(`Missing workstation position ${member.id}`);
      }
      expect(seat?.actorId).toBe(member.id);
      expect(seat?.position).toEqual(expectedPosition);
      expect(seat?.position.x).toBe(state.position.x);
    }
  });

  it("derives seats only for actors present in a department-scoped snapshot", () => {
    // Given
    const fullSnapshot = snapshotAt(40);
    const memberIds = new Set<OfficeActorSnapshot["id"]>(
      OFFICE_SCENE_MANIFEST.departments.company.memberIds,
    );
    const scopedSnapshot = Object.freeze({
      ...fullSnapshot,
      actors: Object.freeze(
        fullSnapshot.actors.filter((actor) => memberIds.has(actor.id)),
      ),
    });

    // When
    const seats = furnitureStatesForSnapshot(scopedSnapshot).flatMap(
      (state) => state.seats,
    );

    // Then
    expect(seats.map((seat) => seat.actorId).sort()).toEqual(
      [...memberIds, ...memberIds].sort(),
    );
    expect(seats.some((seat) => seat.actorId === "chair")).toBe(false);
  });

  it("centers every compact table within its department room", () => {
    const states = furnitureStatesForSnapshot(snapshotAt(40));
    for (const state of states.filter(
      (candidate) => candidate.purpose !== "workstation",
    )) {
      const furniture = OFFICE_SCENE_MANIFEST.furniture.find(
        ({ id }) => id === state.id,
      );
      if (!furniture) throw new Error(`Missing furniture ${state.id}`);
      const room = OFFICE_SCENE_MANIFEST.rooms[furniture.roomId].bounds;
      const expectedCenterX =
        ((room.min.x + room.max.x + 1) * OFFICE_SCENE_MANIFEST.world.cellSize) /
        2;
      const expectedCenterY =
        ((room.min.y + room.max.y + 1) * OFFICE_SCENE_MANIFEST.world.cellSize) /
        2;
      expect(Math.abs(state.position.x - expectedCenterX)).toBeLessThanOrEqual(
        OFFICE_SCENE_MANIFEST.world.cellSize,
      );
      expect(Math.abs(state.position.y - expectedCenterY)).toBeLessThanOrEqual(
        OFFICE_SCENE_MANIFEST.world.cellSize,
      );
    }
  });
});
