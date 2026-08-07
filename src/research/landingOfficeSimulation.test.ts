import { describe, expect, it } from "vitest";
import {
  createLandingOfficeState,
  landingOfficeSnapshot,
  stepLandingOfficeState,
} from "./landingOfficeSimulation";
import { OFFICE_NAVIGATION_GRID, officeCellKey } from "./officeNavigation";
import { type Cell, OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

function edgeKey(from: Cell, to: Cell): string {
  const fromKey = officeCellKey(from);
  const toKey = officeCellKey(to);
  return fromKey < toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;
}

describe("landing office simulation", () => {
  it("cycles every agent through walking and back to seated work", () => {
    let state = createLandingOfficeState(42);
    const moving = new Set<string>();
    const reseated = new Set<string>();

    for (let tick = 0; tick < 480; tick += 1) {
      state = stepLandingOfficeState(state);
      const snapshot = landingOfficeSnapshot(state);
      for (const actor of snapshot.actors) {
        if (actor.action === "walk" || actor.action === "return") {
          moving.add(actor.id);
        }
        if (moving.has(actor.id) && actor.action === "seated-work") {
          reseated.add(actor.id);
        }
      }
    }

    const ids = OFFICE_SCENE_MANIFEST.roster.map(({ id }) => id);
    expect(ids.filter((id) => !moving.has(id))).toEqual([]);
    expect(ids.filter((id) => !reseated.has(id))).toEqual([]);
  });

  it("never overlaps agents or crosses walls and furniture while roaming", () => {
    let state = createLandingOfficeState(42);
    const walkable = new Set(
      OFFICE_NAVIGATION_GRID.walkableCells.map(officeCellKey),
    );
    const blockedEdges = new Set(
      OFFICE_NAVIGATION_GRID.blockedEdges.map(({ from, to }) =>
        edgeKey(from, to),
      ),
    );
    const violations = {
      blockedEdges: 0,
      decorZones: 0,
      edgeSwaps: 0,
      longSteps: 0,
      nonwalkable: 0,
      overlaps: 0,
    };

    for (let tick = 0; tick < 600; tick += 1) {
      const previous = landingOfficeSnapshot(state);
      state = stepLandingOfficeState(state);
      const current = landingOfficeSnapshot(state);
      const occupied = new Set<string>();
      for (const reservation of current.reservations) {
        if (
          current.reservations.some(
            (candidate) =>
              candidate.actorId !== reservation.actorId &&
              officeCellKey(candidate.from) === officeCellKey(reservation.to) &&
              officeCellKey(candidate.to) === officeCellKey(reservation.from),
          )
        ) {
          violations.edgeSwaps += 1;
        }
      }
      for (const actor of current.actors) {
        const cellKey = officeCellKey(actor.cell);
        if (occupied.has(cellKey)) violations.overlaps += 1;
        occupied.add(cellKey);
        if (!walkable.has(cellKey)) violations.nonwalkable += 1;
        const isTopRoom =
          actor.department === "market" ||
          actor.department === "chair" ||
          actor.department === "company";
        const entersWallDisplay = isTopRoom
          ? actor.cell.y < 7
          : actor.cell.y < 24;
        const entersOuterWindow =
          ((actor.department === "market" ||
            actor.department === "financial") &&
            actor.cell.x < 3) ||
          ((actor.department === "company" || actor.department === "risk") &&
            actor.cell.x > 39);
        if (
          actor.action !== "seated-work" &&
          (entersWallDisplay || entersOuterWindow)
        ) {
          violations.decorZones += 1;
        }
        const prior = previous.actors.find(({ id }) => id === actor.id);
        if (!prior) continue;
        const distance =
          Math.abs(prior.cell.x - actor.cell.x) +
          Math.abs(prior.cell.y - actor.cell.y);
        if (distance > 1) violations.longSteps += 1;
        if (
          distance === 1 &&
          blockedEdges.has(edgeKey(prior.cell, actor.cell))
        ) {
          violations.blockedEdges += 1;
        }
      }
    }

    expect(violations).toEqual({
      blockedEdges: 0,
      decorZones: 0,
      edgeSwaps: 0,
      longSteps: 0,
      nonwalkable: 0,
      overlaps: 0,
    });
  });

  it("uses a standing pose while traffic is blocked instead of walking into a wall", () => {
    // Given
    let state = createLandingOfficeState(42);
    let blockedFrames = 0;

    // When
    for (let tick = 0; tick < 600; tick += 1) {
      const previous = landingOfficeSnapshot(state);
      state = stepLandingOfficeState(state);
      const current = landingOfficeSnapshot(state);
      for (const actor of current.actors) {
        const prior = previous.actors.find(({ id }) => id === actor.id);
        if (
          prior !== undefined &&
          officeCellKey(prior.cell) === officeCellKey(actor.cell) &&
          actor.waitTicks > 0
        ) {
          blockedFrames += 1;
          expect(["walk", "return"]).not.toContain(actor.action);
        }
      }
    }

    // Then
    expect(blockedFrames).toBeGreaterThan(0);
  });
});
