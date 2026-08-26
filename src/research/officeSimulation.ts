import {
  DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER,
  OFFICE_CLOCK_CONTRACT,
  type OfficeCameraTarget,
  officeBeatAt,
  officeCameraTargetAt,
  officeDirectivesAt,
  officeEventsAt,
} from "./officeChoreography";
import { assertNeverOffice } from "./officeChoreographyV7Contract";
import { OFFICE_NAVIGATION_GRID } from "./officeNavigation";
import type { WorldPoint } from "./officeSceneManifest";
import {
  OFFICE_SCENE_MANIFEST,
  type OfficeDepartmentId,
} from "./officeSceneManifest";
import {
  createInitialOfficeActors,
  stepOfficeActors,
} from "./officeSimulationV7Actors";
import type {
  OfficeActorSnapshot,
  OfficeFrame,
  OfficeSimulationActor,
  OfficeSimulationOptions,
  OfficeSimulationSnapshot,
  OfficeSimulationState,
} from "./officeSimulationV7Types";
import {
  formatOfficeTraceHash,
  normalizeOfficeTraceFrame,
  OFFICE_TRACE_HASH_OFFSET,
  updateOfficeTraceHash,
} from "./officeTraceV7";

export type {
  OfficeActorSnapshot,
  OfficeFrame,
  OfficeOccupancy,
  OfficeRouteFailureEvent,
  OfficeSimulationActor,
  OfficeSimulationEvent,
  OfficeSimulationOptions,
  OfficeSimulationSnapshot,
  OfficeSimulationState,
} from "./officeSimulationV7Types";

function freezeCamera(camera: OfficeCameraTarget): OfficeCameraTarget {
  switch (camera.kind) {
    case "actors":
      return Object.freeze({
        kind: "actors",
        actorIds: Object.freeze([...camera.actorIds]),
      });
    case "overview":
      return Object.freeze({ kind: "overview" });
    default:
      return assertNeverOffice(camera);
  }
}

function initialState(options: OfficeSimulationOptions): OfficeSimulationState {
  const navigationGrid = options.navigationGrid ?? OFFICE_NAVIGATION_GRID;
  const departmentReleaseOrder = Object.freeze([
    ...(options.departmentReleaseOrder ??
      DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER),
  ]);
  const actors = createInitialOfficeActors(departmentReleaseOrder);
  const events = Object.freeze([...officeEventsAt(0)]);
  const cameraTarget = freezeCamera(
    officeCameraTargetAt(0, departmentReleaseOrder),
  );
  const line = normalizeOfficeTraceFrame({
    tick: 0,
    beatId: "briefing",
    actors,
    reservations: [],
    eventIds: events.map((event) => event.id),
    cameraTarget,
  });
  const traceHashValue = updateOfficeTraceHash(OFFICE_TRACE_HASH_OFFSET, line);
  return Object.freeze({
    tick: 0,
    beatId: "briefing",
    actors,
    reservations: Object.freeze([]),
    events,
    cameraTarget,
    paused: false,
    reducedMotion: options.reducedMotion ?? false,
    departmentReleaseOrder,
    navigationGrid,
    trace: Object.freeze([line]),
    traceHashValue,
    traceHash: formatOfficeTraceHash(traceHashValue),
  });
}

export function createOfficeSimulation(
  options: OfficeSimulationOptions = {},
): OfficeSimulationState {
  return initialState(options);
}

export function stepOfficeSimulation(
  state: OfficeSimulationState,
): OfficeSimulationState {
  if (state.paused || state.tick >= OFFICE_CLOCK_CONTRACT.completeTick)
    return state;
  const tick = state.tick + 1;
  const beat = officeBeatAt(tick);
  const actorStep = stepOfficeActors({
    actors: state.actors,
    directives: officeDirectivesAt(tick, state.departmentReleaseOrder),
    grid: state.navigationGrid,
    reducedMotion: state.reducedMotion,
    tick,
  });
  const events = Object.freeze([
    ...state.events,
    ...officeEventsAt(tick),
    ...actorStep.routeFailures,
  ]);
  const cameraTarget = freezeCamera(
    officeCameraTargetAt(tick, state.departmentReleaseOrder),
  );
  const line = normalizeOfficeTraceFrame({
    tick,
    beatId: beat.id,
    actors: actorStep.actors,
    reservations: actorStep.reservations,
    eventIds: events.map((event) => event.id),
    cameraTarget,
  });
  const traceHashValue = updateOfficeTraceHash(state.traceHashValue, line);
  return Object.freeze({
    ...state,
    tick,
    beatId: beat.id,
    actors: actorStep.actors,
    reservations: actorStep.reservations,
    events,
    cameraTarget,
    trace: Object.freeze([...state.trace, line]),
    traceHashValue,
    traceHash: formatOfficeTraceHash(traceHashValue),
  });
}

export function setOfficeSimulationPaused(
  state: OfficeSimulationState,
  paused: boolean,
): OfficeSimulationState {
  if (state.paused === paused) return state;
  return Object.freeze({ ...state, paused });
}

export function replayOfficeSimulation(
  state: OfficeSimulationState,
): OfficeSimulationState {
  return createOfficeSimulation({
    reducedMotion: state.reducedMotion,
    navigationGrid: state.navigationGrid,
    departmentReleaseOrder: state.departmentReleaseOrder,
  });
}

export function setOfficeDepartmentReleaseOrder(
  state: OfficeSimulationState,
  releaseOrder: readonly OfficeDepartmentId[],
): OfficeSimulationState {
  const normalized = [
    ...new Set(
      releaseOrder.filter((departmentId) =>
        Object.hasOwn(OFFICE_SCENE_MANIFEST.departments, departmentId),
      ),
    ),
  ];
  if (
    normalized.length === state.departmentReleaseOrder.length &&
    normalized.every(
      (departmentId, index) =>
        departmentId === state.departmentReleaseOrder[index],
    )
  ) {
    return state;
  }
  return Object.freeze({
    ...state,
    departmentReleaseOrder: Object.freeze(normalized),
  });
}

export function skipOfficeSimulation(
  state: OfficeSimulationState,
): OfficeSimulationState {
  let current = setOfficeSimulationPaused(state, false);
  while (current.tick < OFFICE_CLOCK_CONTRACT.completeTick) {
    current = stepOfficeSimulation(current);
  }
  return current;
}

function worldPoint(cell: { readonly x: number; readonly y: number }) {
  return Object.freeze({
    x:
      cell.x * OFFICE_SCENE_MANIFEST.world.cellSize +
      OFFICE_SCENE_MANIFEST.world.cellSize / 2,
    y: (cell.y + 1) * OFFICE_SCENE_MANIFEST.world.cellSize,
  });
}

function actorWorld(actor: OfficeSimulationActor): WorldPoint {
  if (actor.motion === null) return worldPoint(actor.cell);
  const from = worldPoint(actor.motion.from);
  const to = worldPoint(actor.motion.to);
  const progress = Math.min(
    1,
    Math.max(0, actor.motion.elapsedTicks / actor.motion.durationTicks),
  );
  const eased = progress * progress * (3 - 2 * progress);
  return Object.freeze({
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased,
  });
}

export function officeSimulationSnapshot(
  state: OfficeSimulationState,
): OfficeSimulationSnapshot {
  const actors: readonly OfficeActorSnapshot[] = Object.freeze(
    state.actors.map((actor) =>
      Object.freeze({
        id: actor.id,
        department: actor.department,
        cell: Object.freeze({ ...actor.cell }),
        world: actorWorld(actor),
        action: actor.action,
        facing: actor.facing,
        destination: Object.freeze({ ...actor.destination }),
        routeIndex: actor.routeIndex,
        scale: actor.scale,
        revision: actor.revision,
        waitTicks: actor.waitTicks,
        failedReplans: actor.failedReplans,
        motion:
          actor.motion === null
            ? null
            : Object.freeze({
                ...actor.motion,
                from: Object.freeze({ ...actor.motion.from }),
                to: Object.freeze({ ...actor.motion.to }),
              }),
      }),
    ),
  );
  const occupancy = Object.freeze(
    actors.map((actor) =>
      Object.freeze({
        actorId: actor.id,
        cell: Object.freeze({ ...actor.cell }),
      }),
    ),
  );
  const reservations = Object.freeze(
    state.reservations.map((reservation) =>
      Object.freeze({
        actorId: reservation.actorId,
        from: Object.freeze({ ...reservation.from }),
        to: Object.freeze({ ...reservation.to }),
      }),
    ),
  );
  return Object.freeze({
    tick: state.tick,
    beatId: state.beatId,
    actors,
    occupancy,
    reservations,
    visibleEventIds: Object.freeze(state.events.map((event) => event.id)),
    cameraTarget: freezeCamera(state.cameraTarget),
    traceHash: state.traceHash,
  });
}

export function createOfficeFrame(
  simulation: OfficeSimulationState,
): OfficeFrame {
  return Object.freeze({
    simulation,
    previousSimulation: simulation,
    accumulatorMs: 0,
    interpolation: 0,
  });
}

export function advanceOfficeFrame(
  frame: OfficeFrame,
  frameDeltaMs: number,
): OfficeFrame {
  if (frame.simulation.paused) return frame;
  const clampedDelta = Math.max(
    0,
    Math.min(frameDeltaMs, OFFICE_CLOCK_CONTRACT.maxFrameDeltaMs),
  );
  const elapsed = frame.accumulatorMs + clampedDelta;
  const ticks = Math.min(
    Math.floor(elapsed / OFFICE_CLOCK_CONTRACT.tickMs),
    OFFICE_CLOCK_CONTRACT.maxCatchUpTicks,
  );
  let simulation = frame.simulation;
  let previousSimulation = frame.previousSimulation;
  for (let index = 0; index < ticks; index += 1) {
    previousSimulation = simulation;
    simulation = stepOfficeSimulation(simulation);
  }
  const accumulatorMs = elapsed - ticks * OFFICE_CLOCK_CONTRACT.tickMs;
  return Object.freeze({
    simulation,
    previousSimulation,
    accumulatorMs,
    interpolation: accumulatorMs / OFFICE_CLOCK_CONTRACT.tickMs,
  });
}
