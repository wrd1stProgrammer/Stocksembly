import {
  findOfficeRoute,
  findYieldRoute,
  type NavigationGrid,
  officeCellKey,
} from "./officeNavigation";
import type { Cell } from "./officeSceneManifest";
import {
  compareTrafficActors,
  type OfficeReservation,
  type OfficeTrafficActor,
  type OfficeTrafficState,
} from "./officeTrafficV7State";

export type {
  OfficeReservation,
  OfficeTrafficActor,
  OfficeTrafficActorInput,
  OfficeTrafficMode,
  OfficeTrafficState,
} from "./officeTrafficV7State";
export { createOfficeTraffic } from "./officeTrafficV7State";

const WAIT_BEFORE_REPLAN_TICKS = 12;
const FAILED_REPLANS_BEFORE_YIELD = 3;

type OfficeReplanContext = {
  readonly grid: NavigationGrid;
  readonly actors: readonly OfficeTrafficActor[];
  readonly actor: OfficeTrafficActor;
  readonly blockerId: string | null;
};

function otherCells(
  actors: readonly OfficeTrafficActor[],
  actorId: string,
): readonly Cell[] {
  return actors
    .filter((candidate) => candidate.id !== actorId)
    .map((candidate) => candidate.cell);
}

function resumeFromYield(
  grid: NavigationGrid,
  actors: readonly OfficeTrafficActor[],
  actor: OfficeTrafficActor,
): OfficeTrafficActor {
  if (
    actor.mode !== "yielding" ||
    actor.originalDestination === null ||
    officeCellKey(actor.cell) !== officeCellKey(actor.destination)
  ) {
    return actor;
  }
  const route = findOfficeRoute(grid, {
    from: actor.cell,
    to: actor.originalDestination,
    blockedCells: otherCells(actors, actor.id),
  });
  if (route.kind === "unreachable") return actor;
  return {
    ...actor,
    destination: actor.originalDestination,
    originalDestination: null,
    route: route.path,
    routeIndex: 0,
    mode: route.path.length === 1 ? "arrived" : "moving",
  };
}

function nextCell(actor: OfficeTrafficActor): Cell | null {
  if (!actor.ready || actor.mode === "arrived" || actor.mode === "failed") {
    return null;
  }
  return actor.route[actor.routeIndex + 1] ?? null;
}

function replanBlockedActor(context: OfficeReplanContext): OfficeTrafficActor {
  const { grid, actors, actor, blockerId } = context;
  const waitTicks = actor.waitTicks + 1;
  if (waitTicks % WAIT_BEFORE_REPLAN_TICKS !== 0) {
    return { ...actor, waitTicks, mode: "waiting", ready: true };
  }
  const blockedCells = otherCells(actors, actor.id);
  const route = findOfficeRoute(grid, {
    from: actor.cell,
    to: actor.destination,
    blockedCells,
  });
  if (route.kind === "found") {
    return {
      ...actor,
      route: route.path,
      routeIndex: 0,
      waitTicks: 0,
      failedReplans: 0,
      mode: route.path.length === 1 ? "arrived" : "moving",
      ready: true,
    };
  }
  const failedReplans = actor.failedReplans + 1;
  const blocker = actors.find((candidate) => candidate.id === blockerId);
  if (
    failedReplans < FAILED_REPLANS_BEFORE_YIELD ||
    !blocker ||
    blocker.priority >= actor.priority ||
    actor.originalDestination !== null
  ) {
    return {
      ...actor,
      waitTicks,
      failedReplans,
      mode: "waiting",
      ready: true,
    };
  }
  const yieldRoute = findYieldRoute(grid, {
    from: actor.cell,
    to: actor.destination,
    blockedCells,
  });
  if (yieldRoute.kind === "unreachable") {
    return {
      ...actor,
      waitTicks,
      failedReplans,
      mode: "waiting",
      ready: true,
    };
  }
  const yieldDestination = yieldRoute.path.at(-1);
  if (!yieldDestination) return actor;
  return {
    ...actor,
    destination: yieldDestination,
    originalDestination: actor.destination,
    route: yieldRoute.path,
    routeIndex: 0,
    waitTicks: 0,
    failedReplans: 0,
    mode: "yielding",
    ready: true,
  };
}

export function stepOfficeTraffic(
  grid: NavigationGrid,
  state: OfficeTrafficState,
): OfficeTrafficState {
  const resumed = state.actors
    .map((actor) => resumeFromYield(grid, state.actors, actor))
    .sort(compareTrafficActors);
  const occupancy = new Map(
    resumed.map((actor) => [officeCellKey(actor.cell), actor.id] as const),
  );
  const reservations: OfficeReservation[] = [];
  const moved = new Map<string, OfficeTrafficActor>();
  const blockers = new Map<string, string | null>();
  for (const actor of resumed) {
    const destination = nextCell(actor);
    if (!destination) {
      moved.set(actor.id, { ...actor, ready: true });
      continue;
    }
    const occupiedBy = occupancy.get(officeCellKey(destination));
    const reversedBy = reservations.find(
      (reservation) =>
        officeCellKey(reservation.from) === officeCellKey(destination) &&
        officeCellKey(reservation.to) === officeCellKey(actor.cell),
    )?.actorId;
    if (occupiedBy || reversedBy) {
      blockers.set(actor.id, occupiedBy ?? reversedBy ?? null);
      moved.set(actor.id, actor);
      continue;
    }
    occupancy.delete(officeCellKey(actor.cell));
    occupancy.set(officeCellKey(destination), actor.id);
    reservations.push({ actorId: actor.id, from: actor.cell, to: destination });
    const routeIndex = actor.routeIndex + 1;
    const arrived =
      officeCellKey(destination) === officeCellKey(actor.destination);
    moved.set(actor.id, {
      ...actor,
      cell: destination,
      routeIndex,
      waitTicks: 0,
      failedReplans: 0,
      mode:
        arrived && actor.originalDestination === null ? "arrived" : actor.mode,
      ready: true,
    });
  }
  const actors = resumed.map((actor) => {
    const current = moved.get(actor.id) ?? actor;
    if (!blockers.has(actor.id)) return current;
    return replanBlockedActor({
      grid,
      actors: resumed,
      actor: current,
      blockerId: blockers.get(actor.id) ?? null,
    });
  });
  return Object.freeze({
    tick: state.tick + 1,
    actors: Object.freeze(actors),
    reservations: Object.freeze(reservations),
  });
}
