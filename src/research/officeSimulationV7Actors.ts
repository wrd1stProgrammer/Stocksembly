import type { OfficeActorDirective } from "./officeChoreography";
import {
  DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER,
  OFFICE_CLOCK_CONTRACT,
  officeDirectivesAt,
  officeEntryCellFor,
} from "./officeChoreography";
import {
  findOfficeRoute,
  findOfficeRouteVia,
  type NavigationGrid,
  officeCellKey,
} from "./officeNavigation";
import {
  type Cell,
  OFFICE_SCENE_MANIFEST,
  type OfficeDepartmentId,
  type OfficeManifestAgentId,
} from "./officeSceneManifest";
import { mergeOfficeTrafficActor } from "./officeSimulationV7TrafficMerge";
import type {
  OfficeRouteFailureEvent,
  OfficeSimulationActor,
} from "./officeSimulationV7Types";
import {
  type OfficeReservation,
  officeTrafficBlockedCells,
  stepOfficeTraffic,
} from "./officeTrafficV7";

export type OfficeActorStepInput = {
  readonly actors: readonly OfficeSimulationActor[];
  readonly directives: readonly OfficeActorDirective[];
  readonly grid: NavigationGrid;
  readonly reducedMotion: boolean;
  readonly tick: number;
};

export type OfficeActorStepResult = {
  readonly actors: readonly OfficeSimulationActor[];
  readonly reservations: readonly OfficeReservation[];
  readonly routeFailures: readonly OfficeRouteFailureEvent[];
};

function directiveFor(
  directives: readonly OfficeActorDirective[],
  actorId: OfficeManifestAgentId,
): OfficeActorDirective {
  const directive = directives.find(
    (candidate) => candidate.actorId === actorId,
  );
  if (!directive)
    throw new RangeError(`Missing choreography directive for ${actorId}`);
  return directive;
}

export function createInitialOfficeActors(
  departmentReleaseOrder: readonly OfficeDepartmentId[] = DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER,
): readonly OfficeSimulationActor[] {
  const directives = officeDirectivesAt(0, departmentReleaseOrder);
  return Object.freeze(
    OFFICE_SCENE_MANIFEST.roster.map((member, priority) => {
      const directive = directiveFor(directives, member.id);
      const initialCell =
        member.departmentId === "chair"
          ? member.workSeat.cell
          : officeEntryCellFor(member.id);
      return Object.freeze({
        id: member.id,
        department: member.departmentId,
        priority,
        cell: initialCell,
        destination: directive.destination,
        originalDestination: null,
        route: Object.freeze([initialCell]),
        routeIndex: 0,
        waitTicks: 0,
        failedReplans: 0,
        mode: "arrived" as const,
        ready: true,
        motion: null,
        action: directive.terminalAction,
        facing: directive.facing,
        targetAction: directive.terminalAction,
        targetFacing: directive.facing,
        travelAction: directive.travelAction,
        directiveKey: directive.revisionKey,
        revision: 0,
        arrivedTick: 0,
        scale: 1 as const,
      });
    }),
  );
}

function routeFailure(
  actorId: OfficeManifestAgentId,
  tick: number,
): OfficeRouteFailureEvent {
  return Object.freeze({
    id: `route-failure-${actorId}-${tick}`,
    tick,
    kind: "route-failure",
    actorId,
    participantIds: Object.freeze([actorId]),
    status: "route-unavailable",
  });
}

function containsCell(
  bounds: { readonly min: Cell; readonly max: Cell },
  cell: Cell,
): boolean {
  return (
    cell.x >= bounds.min.x &&
    cell.x <= bounds.max.x &&
    cell.y >= bounds.min.y &&
    cell.y <= bounds.max.y
  );
}

function departmentAt(cell: Cell): OfficeDepartmentId | undefined {
  return (
    Object.entries(OFFICE_SCENE_MANIFEST.departments) as readonly [
      OfficeDepartmentId,
      (typeof OFFICE_SCENE_MANIFEST.departments)[OfficeDepartmentId],
    ][]
  ).find(([, department]) => containsCell(department.room, cell))?.[0];
}

const lowerDepartments = new Set<OfficeDepartmentId>(["financial", "risk"]);

function preferredDoorWaypoints(from: Cell, to: Cell): readonly Cell[] {
  const sourceDepartment = departmentAt(from);
  const destinationDepartment = departmentAt(to);
  if (
    sourceDepartment !== undefined &&
    sourceDepartment === destinationDepartment
  ) {
    return [];
  }
  const waypoints: Cell[] = [];
  if (sourceDepartment !== undefined) {
    waypoints.push(OFFICE_SCENE_MANIFEST.departments[sourceDepartment].door);
  }
  const sourceIsLower =
    sourceDepartment !== undefined && lowerDepartments.has(sourceDepartment);
  const destinationIsLower =
    destinationDepartment !== undefined &&
    lowerDepartments.has(destinationDepartment);
  const sourceInChair = containsCell(
    OFFICE_SCENE_MANIFEST.chairOffice.room,
    from,
  );
  const destinationInChair = containsCell(
    OFFICE_SCENE_MANIFEST.chairOffice.room,
    to,
  );
  if (
    (sourceIsLower &&
      (destinationInChair ||
        (destinationDepartment !== undefined && !destinationIsLower))) ||
    (destinationIsLower &&
      (sourceInChair || (sourceDepartment !== undefined && !sourceIsLower)))
  ) {
    waypoints.push(OFFICE_SCENE_MANIFEST.chairOffice.door);
  }
  if (destinationDepartment !== undefined) {
    waypoints.push(
      OFFICE_SCENE_MANIFEST.departments[destinationDepartment].door,
    );
  }
  return waypoints;
}

function reconcileDirective(
  actor: OfficeSimulationActor,
  directive: OfficeActorDirective,
  input: OfficeActorStepInput,
): {
  readonly actor: OfficeSimulationActor;
  readonly failure: OfficeRouteFailureEvent | null;
} {
  if (actor.directiveKey === directive.revisionKey) {
    if (
      actor.action === "orient" &&
      actor.arrivedTick !== null &&
      actor.arrivedTick < input.tick
    ) {
      return {
        actor: {
          ...actor,
          action: actor.targetAction,
          facing: actor.targetFacing,
          revision: actor.revision + 1,
        },
        failure: null,
      };
    }
    return { actor, failure: null };
  }
  const destinationMatches =
    officeCellKey(actor.cell) === officeCellKey(directive.destination);
  const semanticsMatch =
    actor.action === directive.terminalAction &&
    actor.facing === directive.facing;
  const settlesAtCompletion = input.tick === OFFICE_CLOCK_CONTRACT.completeTick;
  if (destinationMatches && (semanticsMatch || settlesAtCompletion)) {
    return {
      actor: {
        ...actor,
        action: settlesAtCompletion ? directive.terminalAction : actor.action,
        facing: settlesAtCompletion ? directive.facing : actor.facing,
        targetAction: directive.terminalAction,
        targetFacing: directive.facing,
        travelAction: directive.travelAction,
        directiveKey: directive.revisionKey,
        revision: actor.revision + 1,
      },
      failure: null,
    };
  }
  const routeOrigin = actor.motion?.to ?? actor.cell;
  const routeRequest = {
    from: routeOrigin,
    to: directive.destination,
    blockedCells: officeTrafficBlockedCells(input.actors, actor.id),
  };
  const preferredRoute = findOfficeRouteVia(
    input.grid,
    routeRequest,
    preferredDoorWaypoints(routeOrigin, directive.destination),
  );
  const directRoute =
    preferredRoute.kind === "found"
      ? preferredRoute
      : findOfficeRoute(input.grid, routeRequest);
  // Other actors are temporary traffic, not permanent walls. Keep an authored
  // route available when a team is still queued in the corridor and let the
  // reservation layer serialize each step instead of emitting a false route
  // failure during the opening entrance.
  const staticRouteRequest = { ...routeRequest, blockedCells: [] };
  const staticPreferredRoute =
    directRoute.kind === "found"
      ? directRoute
      : findOfficeRouteVia(
          input.grid,
          staticRouteRequest,
          preferredDoorWaypoints(routeOrigin, directive.destination),
        );
  const route =
    staticPreferredRoute.kind === "found"
      ? staticPreferredRoute
      : findOfficeRoute(input.grid, staticRouteRequest);
  if (route.kind === "unreachable") {
    return {
      actor: {
        ...actor,
        destination: directive.destination,
        originalDestination: null,
        route: [],
        routeIndex: 0,
        mode: "failed",
        ready: true,
        motion: null,
        action: "idle",
        targetAction: directive.terminalAction,
        targetFacing: directive.facing,
        travelAction: directive.travelAction,
        directiveKey: directive.revisionKey,
        revision: actor.revision + 1,
        arrivedTick: null,
      },
      failure: routeFailure(actor.id, input.tick),
    };
  }
  const routePath = actor.motion
    ? Object.freeze([actor.cell, ...route.path])
    : route.path;
  const moves = routePath.length > 1;
  const cell =
    input.reducedMotion && moves ? directive.destination : actor.cell;
  return {
    actor: {
      ...actor,
      cell,
      destination: directive.destination,
      originalDestination: null,
      route: input.reducedMotion && moves ? [directive.destination] : routePath,
      routeIndex: 0,
      waitTicks: 0,
      failedReplans: 0,
      mode: input.reducedMotion || !moves ? "arrived" : "moving",
      ready: input.reducedMotion || !moves,
      motion: input.reducedMotion ? null : actor.motion,
      action: moves && !input.reducedMotion ? "stand" : "orient",
      targetAction: directive.terminalAction,
      targetFacing: directive.facing,
      travelAction: directive.travelAction,
      directiveKey: directive.revisionKey,
      revision: actor.revision + 1,
      arrivedTick: input.reducedMotion || !moves ? input.tick : null,
    },
    failure: null,
  };
}

export function stepOfficeActors(
  input: OfficeActorStepInput,
): OfficeActorStepResult {
  const routeFailures: OfficeRouteFailureEvent[] = [];
  const reconciled = input.actors.map((actor) => {
    const result = reconcileDirective(
      actor,
      directiveFor(input.directives, actor.id),
      input,
    );
    if (result.failure) routeFailures.push(result.failure);
    return result.actor;
  });
  const traffic = stepOfficeTraffic(input.grid, {
    tick: input.tick - 1,
    actors: reconciled,
    reservations: [],
  });
  const actors = reconciled.map((actor) => {
    const trafficActor = traffic.actors.find(
      (candidate) => candidate.id === actor.id,
    );
    if (!trafficActor) throw new RangeError(`Traffic lost actor ${actor.id}`);
    return mergeOfficeTrafficActor({
      actor,
      trafficActor,
      reservation: traffic.reservations.find(
        (candidate) => candidate.actorId === actor.id,
      ),
      tick: input.tick,
    });
  });
  return {
    actors: Object.freeze(actors),
    reservations: traffic.reservations,
    routeFailures: Object.freeze(routeFailures),
  };
}
