import { findOfficeRoute, type NavigationGrid } from "./officeNavigation";
import type { Cell } from "./officeSceneManifest";

export type OfficeTrafficMode =
  | "arrived"
  | "failed"
  | "moving"
  | "waiting"
  | "yielding";

export type OfficeTrafficActorInput = {
  readonly id: string;
  readonly priority: number;
  readonly start: Cell;
  readonly destination: Cell;
};

export type OfficeTrafficActor = {
  readonly id: string;
  readonly priority: number;
  readonly cell: Cell;
  readonly destination: Cell;
  readonly originalDestination: Cell | null;
  readonly route: readonly Cell[];
  readonly routeIndex: number;
  readonly waitTicks: number;
  readonly failedReplans: number;
  readonly mode: OfficeTrafficMode;
  readonly ready: boolean;
};

export type OfficeReservation = {
  readonly actorId: string;
  readonly from: Cell;
  readonly to: Cell;
};

export type OfficeTrafficState = {
  readonly tick: number;
  readonly actors: readonly OfficeTrafficActor[];
  readonly reservations: readonly OfficeReservation[];
};

export function compareTrafficActors(
  left: OfficeTrafficActor,
  right: OfficeTrafficActor,
): number {
  return left.priority - right.priority || left.id.localeCompare(right.id);
}

function plannedActor(
  grid: NavigationGrid,
  input: OfficeTrafficActorInput,
): OfficeTrafficActor {
  const route = findOfficeRoute(grid, {
    from: input.start,
    to: input.destination,
    blockedCells: [],
  });
  if (route.kind === "unreachable") {
    return {
      id: input.id,
      priority: input.priority,
      cell: input.start,
      destination: input.destination,
      originalDestination: null,
      route: [],
      routeIndex: 0,
      waitTicks: 0,
      failedReplans: 0,
      mode: "failed",
      ready: true,
    };
  }
  return {
    id: input.id,
    priority: input.priority,
    cell: input.start,
    destination: input.destination,
    originalDestination: null,
    route: route.path,
    routeIndex: 0,
    waitTicks: 0,
    failedReplans: 0,
    mode: route.path.length === 1 ? "arrived" : "moving",
    ready: true,
  };
}

export function createOfficeTraffic(
  grid: NavigationGrid,
  inputs: readonly OfficeTrafficActorInput[],
): OfficeTrafficState {
  return Object.freeze({
    tick: 0,
    actors: Object.freeze(
      inputs
        .map((input) => plannedActor(grid, input))
        .sort(compareTrafficActors),
    ),
    reservations: Object.freeze([]),
  });
}
