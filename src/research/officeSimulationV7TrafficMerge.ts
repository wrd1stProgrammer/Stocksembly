import { officeCellKey } from "./officeNavigation";
import type { Cell, OfficeFacing } from "./officeSceneManifest";
import type { OfficeSimulationActor } from "./officeSimulationV7Types";
import type { OfficeReservation, OfficeTrafficActor } from "./officeTrafficV7";

export type OfficeTrafficMergeInput = {
  readonly actor: OfficeSimulationActor;
  readonly trafficActor: OfficeTrafficActor;
  readonly reservation: OfficeReservation | undefined;
  readonly tick: number;
};

function directionBetween(from: Cell, to: Cell): OfficeFacing {
  if (to.x < from.x) return "left";
  if (to.x > from.x) return "right";
  return to.y < from.y ? "up" : "down";
}

export function mergeOfficeTrafficActor(
  input: OfficeTrafficMergeInput,
): OfficeSimulationActor {
  const { actor, trafficActor, reservation, tick } = input;
  const moved = reservation !== undefined;
  const navigationChanged =
    moved ||
    actor.waitTicks !== trafficActor.waitTicks ||
    actor.failedReplans !== trafficActor.failedReplans ||
    actor.mode !== trafficActor.mode ||
    officeCellKey(actor.destination) !==
      officeCellKey(trafficActor.destination);
  const reached =
    officeCellKey(trafficActor.cell) ===
    officeCellKey(trafficActor.destination);
  const action = moved
    ? reached && trafficActor.originalDestination === null
      ? "orient"
      : actor.travelAction
    : actor.action === "stand"
      ? "stand"
      : trafficActor.mode === "failed"
        ? "idle"
        : trafficActor.mode === "waiting" || trafficActor.waitTicks > 0
          ? "stand"
          : actor.action;
  return {
    ...actor,
    ...trafficActor,
    id: actor.id,
    action,
    facing: reservation
      ? directionBetween(reservation.from, reservation.to)
      : actor.facing,
    revision: navigationChanged ? actor.revision + 1 : actor.revision,
    arrivedTick: moved && reached ? tick : actor.arrivedTick,
  };
}
