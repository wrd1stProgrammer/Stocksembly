import { describe, expect, it } from "vitest";
import { furnitureStatesForSnapshot } from "./officeGameFurniture";
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
    const seated = snapshotAt(40);
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

  it("leaves six home seats occupied when five representatives reach the forum", () => {
    // Given
    const complete = snapshotAt(1580);

    // When
    const seats = furnitureStatesForSnapshot(complete).flatMap(
      (state) => state.seats,
    );

    // Then
    expect(seats.filter((seat) => seat.occupied)).toHaveLength(6);
    expect(seats.filter((seat) => !seat.occupied)).toHaveLength(5);
  });

  it("derives five table clusters and one fixed seat per manifest actor", () => {
    // Given
    const snapshot = snapshotAt(40);

    // When
    const states = furnitureStatesForSnapshot(snapshot);
    const seats = states.flatMap((state) => state.seats);

    // Then
    expect(states).toHaveLength(OFFICE_SCENE_MANIFEST.furniture.length);
    expect(seats.map((seat) => seat.actorId).sort()).toEqual(
      OFFICE_SCENE_MANIFEST.roster.map((member) => member.id).sort(),
    );
    expect(states.every((state) => state.size.width > state.size.height)).toBe(
      true,
    );
    expect(
      states.every(
        (state) =>
          state.size.width <= OFFICE_SCENE_MANIFEST.world.cellSize * 7 &&
          state.size.height <= OFFICE_SCENE_MANIFEST.world.cellSize * 3,
      ),
    ).toBe(true);
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
      [...memberIds].sort(),
    );
    expect(seats.some((seat) => seat.actorId === "chair")).toBe(false);
  });

  it("centers every compact table within its department room", () => {
    const states = furnitureStatesForSnapshot(snapshotAt(40));
    for (const state of states) {
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
