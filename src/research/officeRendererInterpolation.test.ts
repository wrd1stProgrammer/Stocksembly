import { describe, expect, it } from "vitest";
import type { OfficeActorAction } from "./officeChoreography";
import { renderOfficeSnapshot } from "./officeRenderer";
import type { OfficeFacing, WorldPoint } from "./officeSceneManifest";
import {
  type OfficeActorSnapshot,
  type OfficeSimulationSnapshot,
  officeSimulationSnapshot,
} from "./officeSimulation";
import { runTo } from "./officeSimulationV7TestSupport";

type MarketSnapshotInput = {
  readonly world: WorldPoint;
  readonly facing: OfficeFacing;
  readonly action?: OfficeActorAction;
};

function movedMarketSnapshot(
  snapshot: OfficeSimulationSnapshot,
  input: MarketSnapshotInput,
): OfficeSimulationSnapshot {
  return Object.freeze({
    ...snapshot,
    actors: Object.freeze(
      snapshot.actors.map(
        (actor): OfficeActorSnapshot =>
          actor.id === "market"
            ? Object.freeze({
                ...actor,
                action: input.action ?? "walk",
                facing: input.facing,
                world: Object.freeze(input.world),
              })
            : actor,
      ),
    ),
  });
}

describe("office render interpolation", () => {
  it("interpolates only position while current actor semantics stay canonical", () => {
    // Given
    const base = officeSimulationSnapshot(runTo(360));
    const previous = movedMarketSnapshot(base, {
      world: { x: 360, y: 400 },
      facing: "right",
    });
    const current = movedMarketSnapshot(base, {
      world: { x: 400, y: 400 },
      facing: "left",
      action: "walk",
    });

    // When
    const rendered = renderOfficeSnapshot({
      snapshot: current,
      previousSnapshot: previous,
      interpolation: 0.5,
      reducedMotion: false,
      cameraMode: "snapshot",
      viewport: { width: 1280, height: 720 },
      locale: "en",
    });
    const maya = rendered.actors.find((actor) => actor.id === "market");

    // Then
    expect(rendered.tick).toBe(current.tick);
    expect(maya).toMatchObject({
      action: "walk",
      facing: "left",
      scale: 1,
      world: { x: 380, y: 400 },
    });
    expect(current.occupancy).toEqual(
      current.actors.map(({ id, cell }) => ({ actorId: id, cell })),
    );
  });

  it("snaps reduced motion to the current semantic destination", () => {
    // Given
    const base = officeSimulationSnapshot(runTo(360));
    const previous = movedMarketSnapshot(base, {
      world: { x: 360, y: 400 },
      facing: "right",
    });
    const current = movedMarketSnapshot(base, {
      world: { x: 400, y: 400 },
      facing: "right",
    });

    // When
    const maya = renderOfficeSnapshot({
      snapshot: current,
      previousSnapshot: previous,
      interpolation: 0.25,
      reducedMotion: true,
      cameraMode: "snapshot",
      viewport: { width: 1280, height: 720 },
      locale: "en",
    }).actors.find((actor) => actor.id === "market");

    // Then
    expect(maya?.world).toEqual({ x: 400, y: 400 });
    expect(maya?.facing).toBe("right");
    expect(maya?.scale).toBe(1);
  });
});
