import { describe, expect, it } from "vitest";
import { OFFICE_CLOCK_CONTRACT } from "./officeChoreography";
import {
  createNavigationGrid,
  findOfficeRoute,
  isOfficeCellWalkable,
  OFFICE_NAVIGATION_GRID,
  officeCellKey,
} from "./officeNavigation";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import {
  createOfficeSimulation,
  officeSimulationSnapshot,
  stepOfficeSimulation,
} from "./officeSimulation";
import { createOfficeTraffic, stepOfficeTraffic } from "./officeTrafficV7";

const cell = (x: number, y: number) => ({ x, y });

describe("office navigation", () => {
  it("chooses the same upper A-star route when equal paths exist", () => {
    // Given
    const grid = createNavigationGrid({
      columns: 3,
      rows: 3,
      walkableCells: [
        cell(0, 0),
        cell(1, 0),
        cell(2, 0),
        cell(0, 1),
        cell(2, 1),
        cell(0, 2),
        cell(1, 2),
        cell(2, 2),
      ],
      yieldAnchors: [],
    });

    // When
    const result = findOfficeRoute(grid, {
      from: cell(0, 1),
      to: cell(2, 1),
      blockedCells: [],
    });

    // Then
    expect(result).toEqual({
      kind: "found",
      path: [cell(0, 1), cell(0, 0), cell(1, 0), cell(2, 0), cell(2, 1)],
    });
  });

  it("returns a safe typed failure when no route exists", () => {
    // Given
    const grid = createNavigationGrid({
      columns: 3,
      rows: 1,
      walkableCells: [cell(0, 0), cell(2, 0)],
      yieldAnchors: [],
    });

    // When
    const result = findOfficeRoute(grid, {
      from: cell(0, 0),
      to: cell(2, 0),
      blockedCells: [],
    });

    // Then
    expect(result).toEqual({
      kind: "unreachable",
      from: cell(0, 0),
      to: cell(2, 0),
    });
  });

  it("derives a door-only office topology and walkable yield anchors", () => {
    // Given
    const marketRoom = OFFICE_SCENE_MANIFEST.departments.market.room;
    const marketDoors = OFFICE_SCENE_MANIFEST.rooms.market.doors;
    const marketSeat = OFFICE_SCENE_MANIFEST.roster.find(
      (member) => member.id === "market",
    )?.seat.cell;
    const companySeat = OFFICE_SCENE_MANIFEST.roster.find(
      (member) => member.id === "company",
    )?.seat.cell;
    if (!marketSeat || !companySeat) throw new RangeError("Missing lead seats");

    // When
    const route = findOfficeRoute(OFFICE_NAVIGATION_GRID, {
      from: marketSeat,
      to: companySeat,
      blockedCells: [],
    });

    // Then
    if (route.kind !== "found")
      throw new RangeError("Office route is unreachable");
    const exits = route.path.filter((current, index) => {
      const next = route.path[index + 1];
      if (!next) return false;
      const currentInside =
        current.x >= marketRoom.min.x &&
        current.x <= marketRoom.max.x &&
        current.y >= marketRoom.min.y &&
        current.y <= marketRoom.max.y;
      const nextInside =
        next.x >= marketRoom.min.x &&
        next.x <= marketRoom.max.x &&
        next.y >= marketRoom.min.y &&
        next.y <= marketRoom.max.y;
      return currentInside && !nextInside;
    });
    expect(exits).toHaveLength(1);
    expect(marketDoors).toContainEqual(exits[0]);
    expect(OFFICE_NAVIGATION_GRID.yieldAnchors.length).toBeGreaterThan(0);
    expect(
      OFFICE_NAVIGATION_GRID.yieldAnchors.every((anchor) =>
        isOfficeCellWalkable(OFFICE_NAVIGATION_GRID, anchor),
      ),
    ).toBe(true);
  });

  it("gives a contested next cell to stable lower roster index", () => {
    // Given
    const grid = createNavigationGrid({
      columns: 3,
      rows: 1,
      walkableCells: [cell(0, 0), cell(1, 0), cell(2, 0)],
      yieldAnchors: [],
    });
    const initial = createOfficeTraffic(grid, [
      { id: "market", priority: 0, start: cell(0, 0), destination: cell(1, 0) },
      { id: "risk", priority: 1, start: cell(2, 0), destination: cell(1, 0) },
    ]);

    // When
    const next = stepOfficeTraffic(grid, initial);

    // Then
    expect(next.reservations).toEqual([
      { actorId: "market", from: cell(0, 0), to: cell(1, 0) },
    ]);
    expect(
      new Set(next.actors.map((actor) => officeCellKey(actor.cell))).size,
    ).toBe(2);
  });

  it("replans a malformed route instead of allowing a wall-crossing jump", () => {
    // Given
    const grid = createNavigationGrid({
      columns: 3,
      rows: 1,
      walkableCells: [cell(0, 0), cell(1, 0), cell(2, 0)],
      yieldAnchors: [],
    });
    const initial = createOfficeTraffic(grid, [
      { id: "market", priority: 0, start: cell(0, 0), destination: cell(2, 0) },
    ]);
    const malformed = Object.freeze({
      ...initial,
      actors: Object.freeze(
        initial.actors.map((actor) =>
          Object.freeze({
            ...actor,
            // This diagonal/non-walkable edge simulates a stale route from a
            // previous room layout.
            destination: cell(1, 1),
            route: Object.freeze([cell(0, 0), cell(1, 1)]),
          }),
        ),
      ),
    });

    // When
    const next = stepOfficeTraffic(grid, malformed);
    const actor = next.actors[0];

    // Then
    expect(actor).toMatchObject({
      cell: cell(0, 0),
      mode: "waiting",
      route: [],
      waitTicks: 12,
    });
    expect(next.reservations).toEqual([]);
  });

  it("resolves a head-on chokepoint after three failed replans without a swap", () => {
    // Given
    const grid = createNavigationGrid({
      columns: 5,
      rows: 2,
      walkableCells: [
        cell(0, 1),
        cell(1, 1),
        cell(2, 1),
        cell(3, 1),
        cell(4, 1),
        cell(3, 0),
      ],
      yieldAnchors: [cell(3, 0)],
    });
    let traffic = createOfficeTraffic(grid, [
      { id: "market", priority: 0, start: cell(0, 1), destination: cell(4, 1) },
      { id: "risk", priority: 1, start: cell(4, 1), destination: cell(0, 1) },
    ]);
    let observedSwap = false;
    let firstYieldTick: number | null = null;
    const failedReplanTicks: number[] = [];
    let priorFailedReplans = 0;

    // When
    for (let tick = 0; tick < 120; tick += 1) {
      traffic = stepOfficeTraffic(grid, traffic);
      const lowerPriority = traffic.actors.find((actor) => actor.id === "risk");
      if (!lowerPriority) throw new RangeError("Missing lower-priority actor");
      if (lowerPriority.failedReplans > priorFailedReplans)
        failedReplanTicks.push(tick + 1);
      if (lowerPriority.mode === "yielding" && firstYieldTick === null)
        firstYieldTick = tick + 1;
      priorFailedReplans = lowerPriority.failedReplans;
      const reservations = traffic.reservations;
      observedSwap ||= reservations.some((left, index) =>
        reservations
          .slice(index + 1)
          .some(
            (right) =>
              officeCellKey(left.from) === officeCellKey(right.to) &&
              officeCellKey(left.to) === officeCellKey(right.from),
          ),
      );
    }

    // Then
    expect(failedReplanTicks).toEqual([13, 25]);
    expect(firstYieldTick).toBe(37);
    expect(observedSwap).toBe(false);
    expect(
      traffic.actors.map(({ id, cell: current }) => [id, current]),
    ).toEqual([
      ["market", cell(4, 1)],
      ["risk", cell(0, 1)],
    ]);
    expect(
      new Set(traffic.actors.map((actor) => officeCellKey(actor.cell))).size,
    ).toBe(2);
  });

  it("keeps the complete authored trajectory walkable, reserved, and orient-first", () => {
    // Given
    let state = createOfficeSimulation();
    let previous = officeSimulationSnapshot(state);
    const speaking = new Set(["talk", "present", "chair-synthesis"]);
    const representatives = Object.values(
      OFFICE_SCENE_MANIFEST.departments,
    ).map((department) => department.representativeId);
    let orientedTransitions = 0;

    // When
    while (state.tick < OFFICE_CLOCK_CONTRACT.completeTick) {
      state = stepOfficeSimulation(state);
      const snapshot = officeSimulationSnapshot(state);
      const occupancy = snapshot.occupancy.map(({ cell: current }) =>
        officeCellKey(current),
      );
      const destinations = snapshot.reservations.map(({ to }) =>
        officeCellKey(to),
      );
      // Then
      expect(new Set(occupancy).size).toBe(snapshot.actors.length);
      expect(new Set(destinations).size).toBe(destinations.length);
      expect(
        snapshot.actors.every((member) =>
          isOfficeCellWalkable(OFFICE_NAVIGATION_GRID, member.cell),
        ),
      ).toBe(true);
      expect(state.actors.every((member) => member.mode !== "failed")).toBe(
        true,
      );
      for (const reservation of snapshot.reservations) {
        expect(
          Math.abs(reservation.from.x - reservation.to.x) +
            Math.abs(reservation.from.y - reservation.to.y),
        ).toBe(1);
        expect(
          snapshot.reservations.some(
            (other) =>
              officeCellKey(reservation.from) === officeCellKey(other.to) &&
              officeCellKey(reservation.to) === officeCellKey(other.from),
          ),
        ).toBe(false);
      }
      for (const member of snapshot.actors) {
        const prior = previous.actors.find(
          (candidate) => candidate.id === member.id,
        );
        if (!prior) throw new RangeError(`Missing prior actor ${member.id}`);
        if (speaking.has(member.action) && member.action !== prior.action) {
          expect(prior.action).toBe("orient");
          orientedTransitions += 1;
        }
      }
      const presenter = representatives[(state.tick - 1301) / 60];
      if (presenter) {
        expect(
          snapshot.actors.find((member) => member.id === presenter)?.action,
        ).toBe("present");
        expect(
          snapshot.actors.find((member) => member.id === "chair")?.action,
        ).toBe("listen");
      }
      if (state.tick === 1541) {
        expect(
          snapshot.actors.find((member) => member.id === "chair")?.action,
        ).toBe("chair-synthesis");
      }
      if (state.tick === 80) {
        expect(
          snapshot.actors.map(({ cell, action }) => [cell, action]),
        ).toEqual(previous.actors.map(({ cell, action }) => [cell, action]));
        expect(
          snapshot.actors.every(
            (member, index) =>
              member.revision > (previous.actors[index]?.revision ?? -1),
          ),
        ).toBe(true);
      }
      previous = snapshot;
    }
    expect(orientedTransitions).toBeGreaterThan(10);
  });
});
