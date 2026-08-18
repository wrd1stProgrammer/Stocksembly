import {
  findOfficeRoute,
  findYieldRoute,
  isOfficeCellWalkable,
  type NavigationGrid,
  officeCellKey,
} from "./officeNavigation";
import type { Cell } from "./officeSceneManifest";
import {
  compareTrafficActors,
  type OfficeMotionSegment,
  type OfficeReservation,
  type OfficeTrafficActor,
  type OfficeTrafficState,
} from "./officeTrafficV7State";

export type {
  OfficeMotionSegment,
  OfficeReservation,
  OfficeTrafficActor,
  OfficeTrafficActorInput,
  OfficeTrafficMode,
  OfficeTrafficState,
} from "./officeTrafficV7State";
export { createOfficeTraffic } from "./officeTrafficV7State";

const WAIT_BEFORE_REPLAN_TICKS = 12;
const FAILED_REPLANS_BEFORE_YIELD = 3;
export const OFFICE_TRAFFIC_STEP_TICKS = 2;

type OfficeReplanContext = {
  readonly grid: NavigationGrid;
  readonly actors: readonly OfficeTrafficActor[];
  readonly actor: OfficeTrafficActor;
  readonly blockerId: string | null;
};

type OfficeTrafficOccupant = Pick<OfficeTrafficActor, "cell" | "id" | "motion">;

function occupiedCells(actor: OfficeTrafficOccupant): readonly Cell[] {
  const anchors = actor.motion ? [actor.cell, actor.motion.to] : [actor.cell];
  if (actor.id !== "chair") return anchors;
  return anchors.flatMap((anchor) => {
    const cells: Cell[] = [];
    for (let y = anchor.y - 1; y <= anchor.y + 1; y += 1) {
      for (let x = anchor.x - 1; x <= anchor.x + 1; x += 1) {
        cells.push({ x, y });
      }
    }
    return cells;
  });
}

export function officeTrafficBlockedCells(
  actors: readonly OfficeTrafficOccupant[],
  actorId: string,
): readonly Cell[] {
  const blocked: Cell[] = [];
  for (const candidate of actors) {
    if (candidate.id !== actorId) blocked.push(...occupiedCells(candidate));
  }
  return blocked;
}

function otherCells(
  actors: readonly OfficeTrafficActor[],
  actorId: string,
): readonly Cell[] {
  return officeTrafficBlockedCells(actors, actorId);
}

function resumeFromYield(
  grid: NavigationGrid,
  actors: readonly OfficeTrafficActor[],
  actor: OfficeTrafficActor,
): OfficeTrafficActor {
  if (
    actor.mode !== "yielding" ||
    actor.motion !== null ||
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

function edgeKey(from: Cell, to: Cell): string {
  const fromKey = officeCellKey(from);
  const toKey = officeCellKey(to);
  return fromKey < toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;
}

function canTraverse(grid: NavigationGrid, from: Cell, to: Cell): boolean {
  const distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
  return (
    distance === 1 &&
    isOfficeCellWalkable(grid, from) &&
    isOfficeCellWalkable(grid, to) &&
    !grid.blockedEdges.some(
      (blockedEdge) =>
        edgeKey(blockedEdge.from, blockedEdge.to) === edgeKey(from, to),
    )
  );
}

function nextCell(
  grid: NavigationGrid,
  actor: OfficeTrafficActor,
): Cell | null {
  if (
    actor.motion !== null ||
    !actor.ready ||
    actor.mode === "arrived" ||
    actor.mode === "failed"
  ) {
    return null;
  }
  const next = actor.route[actor.routeIndex + 1] ?? null;
  if (next === null || !canTraverse(grid, actor.cell, next)) return null;
  return next;
}

function reservationForMotion(
  actorId: string,
  motion: OfficeMotionSegment,
): OfficeReservation {
  return Object.freeze({ actorId, from: motion.from, to: motion.to });
}

function advanceMotion(actor: OfficeTrafficActor): OfficeTrafficActor {
  if (actor.motion === null) return actor;
  const elapsedTicks = actor.motion.elapsedTicks + 1;
  if (elapsedTicks < actor.motion.durationTicks) {
    return {
      ...actor,
      motion: { ...actor.motion, elapsedTicks },
      ready: false,
    };
  }
  const cell = actor.motion.to;
  const routeIndex = actor.routeIndex + 1;
  const arrived = officeCellKey(cell) === officeCellKey(actor.destination);
  return {
    ...actor,
    cell,
    routeIndex,
    motion: null,
    mode:
      arrived && actor.originalDestination === null ? "arrived" : actor.mode,
    ready: true,
  };
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
  const advanced = state.actors.map(advanceMotion);
  const resumed = advanced
    .map((actor) => resumeFromYield(grid, advanced, actor))
    .sort(compareTrafficActors);
  const occupancy = new Map(
    resumed.flatMap((actor) =>
      occupiedCells(actor).map(
        (cell) => [officeCellKey(cell), actor.id] as const,
      ),
    ),
  );
  const reservations: OfficeReservation[] = resumed.flatMap((actor) =>
    actor.motion ? [reservationForMotion(actor.id, actor.motion)] : [],
  );
  const moved = new Map<string, OfficeTrafficActor>();
  const blockers = new Map<string, string | null>();
  for (const actor of resumed) {
    if (actor.motion !== null) {
      moved.set(actor.id, actor);
      continue;
    }
    const plannedDestination = actor.route[actor.routeIndex + 1] ?? null;
    const destination = nextCell(grid, actor);
    // Routes are authored by the grid, but keep the traffic layer as the
    // final collision authority.  A stale/corrupt route must be replanned in
    // place instead of allowing a diagonal or wall-crossing jump followed by
    // a visual snap on the next render frame.
    if (
      plannedDestination !== null &&
      destination === null &&
      actor.ready &&
      actor.mode !== "arrived" &&
      actor.mode !== "failed"
    ) {
      blockers.set(actor.id, null);
      moved.set(actor.id, {
        ...actor,
        route: Object.freeze([]),
        routeIndex: 0,
        mode: "waiting",
        waitTicks: WAIT_BEFORE_REPLAN_TICKS - 1,
      });
      continue;
    }
    if (!destination) {
      moved.set(actor.id, { ...actor, ready: true });
      continue;
    }
    const occupant = occupancy.get(officeCellKey(destination));
    const occupiedBy = occupant === actor.id ? undefined : occupant;
    const reservedBy = reservations.find(
      (reservation) =>
        officeCellKey(reservation.to) === officeCellKey(destination),
    )?.actorId;
    const reversedBy = reservations.find(
      (reservation) =>
        officeCellKey(reservation.from) === officeCellKey(destination) &&
        officeCellKey(reservation.to) === officeCellKey(actor.cell),
    )?.actorId;
    if (occupiedBy || reservedBy || reversedBy) {
      blockers.set(actor.id, occupiedBy ?? reservedBy ?? reversedBy ?? null);
      moved.set(actor.id, actor);
      continue;
    }
    reservations.push(
      reservationForMotion(actor.id, {
        from: actor.cell,
        to: destination,
        elapsedTicks: 0,
        durationTicks: OFFICE_TRAFFIC_STEP_TICKS,
      }),
    );
    moved.set(actor.id, {
      ...actor,
      motion: {
        from: actor.cell,
        to: destination,
        elapsedTicks: 0,
        durationTicks: OFFICE_TRAFFIC_STEP_TICKS,
      },
      waitTicks: 0,
      failedReplans: 0,
      mode: actor.mode === "waiting" ? "moving" : actor.mode,
      ready: false,
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
