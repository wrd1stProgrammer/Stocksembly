import type { OfficeActorAction } from "./officeChoreography";
import {
  createNavigationGrid,
  findOfficeRoute,
  OFFICE_NAVIGATION_GRID,
  officeCellKey,
} from "./officeNavigation";
import {
  type Cell,
  type CellRect,
  OFFICE_SCENE_MANIFEST,
  type OfficeFacing,
  type OfficeManifestAgentId,
} from "./officeSceneManifest";
import type {
  OfficeActorSnapshot,
  OfficeSimulationSnapshot,
} from "./officeSimulation";
import {
  type OfficeMotionSegment,
  type OfficeReservation,
  type OfficeTrafficMode,
  stepOfficeTraffic,
} from "./officeTrafficV7";

type AmbientPhase = "away" | "outbound" | "returning" | "seated";

type AmbientActor = {
  readonly id: OfficeManifestAgentId;
  readonly cell: Cell;
  readonly destination: Cell;
  readonly facing: OfficeFacing;
  readonly failedReplans: number;
  readonly holdTicks: number;
  readonly mode: OfficeTrafficMode;
  readonly motion: OfficeMotionSegment | null;
  readonly originalDestination: Cell | null;
  readonly phase: AmbientPhase;
  readonly priority: number;
  readonly ready: boolean;
  readonly revision: number;
  readonly route: readonly Cell[];
  readonly routeIndex: number;
  readonly waitTicks: number;
};

export type LandingOfficeState = {
  readonly actors: readonly AmbientActor[];
  readonly randomSeed: number;
  readonly reservations: readonly OfficeReservation[];
  readonly tick: number;
};

const seatKeys = new Set(
  OFFICE_SCENE_MANIFEST.roster.map((member) => officeCellKey(member.seat.cell)),
);

const roamingFloorByDepartment = {
  market: { min: { x: 3, y: 7 }, max: { x: 15, y: 15 } },
  chair: { min: { x: 18, y: 7 }, max: { x: 27, y: 15 } },
  company: { min: { x: 30, y: 7 }, max: { x: 39, y: 15 } },
  financial: { min: { x: 3, y: 24 }, max: { x: 18, y: 32 } },
  risk: { min: { x: 24, y: 24 }, max: { x: 39, y: 32 } },
} as const satisfies Readonly<
  Record<
    (typeof OFFICE_SCENE_MANIFEST.roster)[number]["departmentId"],
    CellRect
  >
>;

const roamingFloorCells = OFFICE_NAVIGATION_GRID.walkableCells.filter(
  (cell) =>
    seatKeys.has(officeCellKey(cell)) ||
    Object.values(roamingFloorByDepartment).some((floor) =>
      contains(floor, cell),
    ),
);
const roamingFloorCellKeys = new Set(roamingFloorCells.map(officeCellKey));
const LANDING_NAVIGATION_GRID = createNavigationGrid({
  columns: OFFICE_NAVIGATION_GRID.columns,
  rows: OFFICE_NAVIGATION_GRID.rows,
  walkableCells: roamingFloorCells,
  yieldAnchors: [],
  blockedEdges: OFFICE_NAVIGATION_GRID.blockedEdges.filter(
    ({ from, to }) =>
      roamingFloorCellKeys.has(officeCellKey(from)) &&
      roamingFloorCellKeys.has(officeCellKey(to)),
  ),
});

function contains(rect: CellRect, cell: Cell): boolean {
  return (
    cell.x >= rect.min.x &&
    cell.x <= rect.max.x &&
    cell.y >= rect.min.y &&
    cell.y <= rect.max.y
  );
}

function randomStep(seed: number): number {
  return (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
}

function randomInteger(seed: number, maximum: number): number {
  return maximum === 0 ? 0 : seed % maximum;
}

function facingBetween(
  from: Cell,
  to: Cell,
  fallback: OfficeFacing,
): OfficeFacing {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX < 0 ? "left" : "right";
  if (deltaY !== 0) return deltaY < 0 ? "up" : "down";
  return fallback;
}

function memberFor(actorId: string) {
  const member = OFFICE_SCENE_MANIFEST.roster.find(
    (candidate) => candidate.id === actorId,
  );
  if (!member) throw new RangeError(`No office member ${actorId}`);
  return member;
}

function route(from: Cell, to: Cell): readonly Cell[] {
  const result = findOfficeRoute(LANDING_NAVIGATION_GRID, {
    from,
    to,
    blockedCells: [],
  });
  return result.kind === "found" ? result.path : Object.freeze([from]);
}

function walkingTarget(actor: AmbientActor, seed: number): Cell {
  const member = memberFor(actor.id);
  const floor = roamingFloorByDepartment[member.departmentId];
  const candidates = LANDING_NAVIGATION_GRID.walkableCells.filter(
    (cell) =>
      contains(floor, cell) &&
      !seatKeys.has(officeCellKey(cell)) &&
      Math.abs(cell.x - actor.cell.x) + Math.abs(cell.y - actor.cell.y) >= 4,
  );
  return candidates[randomInteger(seed, candidates.length)] ?? actor.cell;
}

export function createLandingOfficeState(
  seed = 2_026_072_2,
): LandingOfficeState {
  return Object.freeze({
    tick: 0,
    randomSeed: seed >>> 0,
    reservations: Object.freeze([]),
    actors: Object.freeze(
      OFFICE_SCENE_MANIFEST.roster.map((member, index) =>
        Object.freeze({
          id: member.id,
          cell: Object.freeze({ ...member.seat.cell }),
          destination: Object.freeze({ ...member.seat.cell }),
          facing: member.seat.facing,
          failedReplans: 0,
          holdTicks: 2 + (index % 7),
          mode: "arrived" as const,
          motion: null,
          originalDestination: null,
          phase: "seated" as const,
          priority: index,
          ready: true,
          revision: 0,
          route: Object.freeze([Object.freeze({ ...member.seat.cell })]),
          routeIndex: 0,
          waitTicks: 0,
        }),
      ),
    ),
  });
}

function prepareActor(
  actor: AmbientActor,
  seed: number,
  canDepart: boolean,
): AmbientActor {
  const member = memberFor(actor.id);
  if (actor.phase === "seated" && actor.holdTicks > 0) {
    return Object.freeze({ ...actor, holdTicks: actor.holdTicks - 1 });
  }
  if (actor.phase === "seated") {
    if (!canDepart) return Object.freeze({ ...actor, holdTicks: 1 });
    const destination = walkingTarget(actor, seed);
    const nextRoute = route(actor.cell, destination);
    return Object.freeze({
      ...actor,
      destination,
      failedReplans: 0,
      mode: nextRoute.length === 1 ? "arrived" : "moving",
      originalDestination: null,
      phase: "outbound",
      revision: actor.revision + 1,
      route: nextRoute,
      routeIndex: 0,
      waitTicks: 0,
    });
  }
  if (actor.phase === "away" && actor.holdTicks > 0) {
    return Object.freeze({ ...actor, holdTicks: actor.holdTicks - 1 });
  }
  if (actor.phase === "away") {
    const nextRoute = route(actor.cell, member.seat.cell);
    return Object.freeze({
      ...actor,
      destination: member.seat.cell,
      failedReplans: 0,
      mode: nextRoute.length === 1 ? "arrived" : "moving",
      originalDestination: null,
      phase: "returning",
      revision: actor.revision + 1,
      route: nextRoute,
      routeIndex: 0,
      waitTicks: 0,
    });
  }
  return actor;
}

export function stepLandingOfficeState(
  state: LandingOfficeState,
): LandingOfficeState {
  let seed = state.randomSeed;
  const busyDepartments = new Set(
    state.actors
      .filter((actor) => actor.phase !== "seated")
      .map((actor) => memberFor(actor.id).departmentId),
  );
  const prepared = state.actors.map((actor) => {
    seed = randomStep(seed);
    const departmentId = memberFor(actor.id).departmentId;
    const preparedActor = prepareActor(
      actor,
      seed,
      !busyDepartments.has(departmentId),
    );
    if (preparedActor.phase !== "seated") busyDepartments.add(departmentId);
    return preparedActor;
  });
  const traffic = stepOfficeTraffic(LANDING_NAVIGATION_GRID, {
    tick: state.tick,
    actors: prepared,
    reservations: state.reservations,
  });
  const trafficById = new Map(
    traffic.actors.map((actor) => [actor.id, actor] as const),
  );
  const actors = prepared.map((actor) => {
    const moved = trafficById.get(actor.id);
    if (!moved) throw new RangeError(`Traffic lost ambient actor ${actor.id}`);
    const member = memberFor(actor.id);
    const facing = facingBetween(
      actor.cell,
      moved.motion?.to ?? moved.cell,
      actor.facing,
    );
    const next: AmbientActor = { ...actor, ...moved, id: actor.id, facing };
    if (moved.mode !== "arrived") return Object.freeze(next);
    if (actor.phase === "returning") {
      return Object.freeze({
        ...next,
        cell: member.seat.cell,
        destination: member.seat.cell,
        facing: member.seat.facing,
        holdTicks: 4 + randomInteger(seed, 8),
        phase: "seated" as const,
      });
    }
    if (actor.phase === "outbound") {
      return Object.freeze({
        ...next,
        holdTicks: 2 + randomInteger(seed, 5),
        phase: "away" as const,
      });
    }
    return Object.freeze(next);
  });
  return Object.freeze({
    tick: state.tick + 1,
    randomSeed: seed,
    actors: Object.freeze(actors),
    reservations: traffic.reservations,
  });
}

function actorAction(actor: AmbientActor): OfficeActorAction {
  if (actor.phase === "seated") return "seated-work";
  if (actor.mode === "waiting" || actor.waitTicks > 0) return "stand";
  if (actor.phase === "returning") return "return";
  if (actor.phase === "outbound") return "walk";
  return "idle";
}

function worldPoint(cell: Cell) {
  const { cellSize } = OFFICE_SCENE_MANIFEST.world;
  return Object.freeze({
    x: cell.x * cellSize + cellSize / 2,
    y: (cell.y + 1) * cellSize,
  });
}

function ambientWorld(actor: AmbientActor) {
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

export function landingOfficeSnapshot(
  state: LandingOfficeState,
): OfficeSimulationSnapshot {
  const actors: readonly OfficeActorSnapshot[] = Object.freeze(
    state.actors.map((actor) => {
      const member = memberFor(actor.id);
      return Object.freeze({
        id: actor.id,
        department: member.departmentId,
        cell: Object.freeze({ ...actor.cell }),
        world: ambientWorld(actor),
        action: actorAction(actor),
        facing: actor.facing,
        destination: Object.freeze({ ...actor.destination }),
        routeIndex: actor.routeIndex,
        scale: 1 as const,
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
      });
    }),
  );
  return Object.freeze({
    tick: state.tick,
    beatId: "parallel-work",
    actors,
    occupancy: Object.freeze(
      actors.map((actor) =>
        Object.freeze({ actorId: actor.id, cell: actor.cell }),
      ),
    ),
    reservations: state.reservations.map((reservation) => {
      const member = memberFor(reservation.actorId);
      return Object.freeze({
        actorId: member.id,
        from: Object.freeze({ ...reservation.from }),
        to: Object.freeze({ ...reservation.to }),
      });
    }),
    visibleEventIds: Object.freeze([]),
    cameraTarget: Object.freeze({ kind: "overview" }),
    traceHash: `landing-${state.tick}`,
  });
}
