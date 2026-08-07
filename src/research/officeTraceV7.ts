import {
  assertNeverOffice,
  type OfficeCameraTarget,
} from "./officeChoreographyV7Contract";
import { officeCellKey } from "./officeNavigation";
import type { OfficeSimulationActor } from "./officeSimulationV7Types";
import type { OfficeReservation } from "./officeTrafficV7";

export const OFFICE_TRACE_HASH_OFFSET = 2_166_136_261;

export type OfficeTraceFrame = {
  readonly tick: number;
  readonly beatId: string;
  readonly actors: readonly OfficeSimulationActor[];
  readonly reservations: readonly OfficeReservation[];
  readonly eventIds: readonly string[];
  readonly cameraTarget: OfficeCameraTarget;
};

function normalizedCamera(camera: OfficeCameraTarget): string {
  switch (camera.kind) {
    case "actors":
      return `actors:${camera.actorIds.join(",")}`;
    case "overview":
      return "overview";
    default:
      return assertNeverOffice(camera);
  }
}

export function normalizeOfficeTraceFrame(frame: OfficeTraceFrame): string {
  const actors = [...frame.actors]
    .sort((left, right) => left.priority - right.priority)
    .map(
      (actor) =>
        `${actor.id}:${actor.department}@${officeCellKey(actor.cell)}>${officeCellKey(actor.destination)}:${actor.action}:${actor.facing}:${actor.routeIndex}:${actor.revision}:${actor.motion === null ? "still" : `${officeCellKey(actor.motion.from)}>${officeCellKey(actor.motion.to)}@${actor.motion.elapsedTicks}/${actor.motion.durationTicks}`}`,
    )
    .join("|");
  const reservations = [...frame.reservations]
    .sort((left, right) => left.actorId.localeCompare(right.actorId))
    .map(
      (reservation) =>
        `${reservation.actorId}:${officeCellKey(reservation.from)}>${officeCellKey(reservation.to)}`,
    )
    .join("|");
  return [
    frame.tick,
    frame.beatId,
    actors,
    reservations,
    frame.eventIds.join(","),
    normalizedCamera(frame.cameraTarget),
  ].join(";");
}

export function updateOfficeTraceHash(previous: number, value: string): number {
  let hash = previous;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
}

export function formatOfficeTraceHash(value: number): string {
  return value.toString(16).padStart(8, "0");
}
