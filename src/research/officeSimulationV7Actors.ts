import type { OfficeActorDirective } from "./officeChoreography";
import {
  OFFICE_CLOCK_CONTRACT,
  officeDirectivesAt,
} from "./officeChoreography";
import {
  findOfficeRoute,
  type NavigationGrid,
  officeCellKey,
} from "./officeNavigation";
import {
  OFFICE_SCENE_MANIFEST,
  type OfficeManifestAgentId,
} from "./officeSceneManifest";
import { mergeOfficeTrafficActor } from "./officeSimulationV7TrafficMerge";
import type {
  OfficeRouteFailureEvent,
  OfficeSimulationActor,
} from "./officeSimulationV7Types";
import { type OfficeReservation, stepOfficeTraffic } from "./officeTrafficV7";

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

export function createInitialOfficeActors(): readonly OfficeSimulationActor[] {
  const directives = officeDirectivesAt(0);
  return Object.freeze(
    OFFICE_SCENE_MANIFEST.roster.map((member, priority) => {
      const directive = directiveFor(directives, member.id);
      return Object.freeze({
        id: member.id,
        department: member.departmentId,
        priority,
        cell: member.seat.cell,
        destination: directive.destination,
        originalDestination: null,
        route: Object.freeze([member.seat.cell]),
        routeIndex: 0,
        waitTicks: 0,
        failedReplans: 0,
        mode: "arrived" as const,
        ready: true,
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
  const route = findOfficeRoute(input.grid, {
    from: actor.cell,
    to: directive.destination,
    blockedCells: [],
  });
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
  const moves = route.path.length > 1;
  const cell =
    input.reducedMotion && moves ? directive.destination : actor.cell;
  return {
    actor: {
      ...actor,
      cell,
      destination: directive.destination,
      originalDestination: null,
      route:
        input.reducedMotion && moves ? [directive.destination] : route.path,
      routeIndex: 0,
      waitTicks: 0,
      failedReplans: 0,
      mode: input.reducedMotion || !moves ? "arrived" : "moving",
      ready: input.reducedMotion || !moves,
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
