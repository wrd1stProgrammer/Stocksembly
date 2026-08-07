import type {
  OfficeActorAction,
  OfficeBeatId,
  OfficeCameraTarget,
  OfficeChoreographyEvent,
} from "./officeChoreography";
import type { NavigationGrid } from "./officeNavigation";
import type {
  Cell,
  OFFICE_SCENE_MANIFEST,
  OfficeFacing,
  OfficeManifestAgentId,
  WorldPoint,
} from "./officeSceneManifest";
import type { OfficeReservation, OfficeTrafficActor } from "./officeTrafficV7";

export type OfficeSimulationOptions = {
  readonly reducedMotion?: boolean;
  readonly navigationGrid?: NavigationGrid;
};

export type OfficeSimulationActor = OfficeTrafficActor & {
  readonly id: OfficeManifestAgentId;
  readonly department: (typeof OFFICE_SCENE_MANIFEST.roster)[number]["departmentId"];
  readonly action: OfficeActorAction;
  readonly facing: OfficeFacing;
  readonly targetAction: OfficeActorAction;
  readonly targetFacing: OfficeFacing;
  readonly travelAction: "return" | "walk";
  readonly directiveKey: string;
  readonly revision: number;
  readonly arrivedTick: number | null;
  readonly scale: 1;
};

export type OfficeRouteFailureEvent = {
  readonly id: string;
  readonly tick: number;
  readonly kind: "route-failure";
  readonly actorId: OfficeManifestAgentId;
  readonly participantIds: readonly OfficeManifestAgentId[];
  readonly status: "route-unavailable";
};

export type OfficeSimulationEvent =
  | OfficeChoreographyEvent
  | OfficeRouteFailureEvent;

export type OfficeSimulationState = {
  readonly tick: number;
  readonly beatId: OfficeBeatId;
  readonly actors: readonly OfficeSimulationActor[];
  readonly reservations: readonly OfficeReservation[];
  readonly events: readonly OfficeSimulationEvent[];
  readonly cameraTarget: OfficeCameraTarget;
  readonly paused: boolean;
  readonly reducedMotion: boolean;
  readonly navigationGrid: NavigationGrid;
  readonly trace: readonly string[];
  readonly traceHashValue: number;
  readonly traceHash: string;
};

export type OfficeActorSnapshot = {
  readonly id: OfficeManifestAgentId;
  readonly department: OfficeSimulationActor["department"];
  readonly cell: Cell;
  readonly world: WorldPoint;
  readonly action: OfficeActorAction;
  readonly facing: OfficeFacing;
  readonly destination: Cell;
  readonly routeIndex: number;
  readonly scale: 1;
  readonly revision: number;
  readonly waitTicks: number;
  readonly failedReplans: number;
  readonly motion: OfficeSimulationActor["motion"];
};

export type OfficeOccupancy = {
  readonly actorId: OfficeManifestAgentId;
  readonly cell: Cell;
};

export type OfficeSimulationSnapshot = {
  readonly tick: number;
  readonly beatId: OfficeBeatId;
  readonly actors: readonly OfficeActorSnapshot[];
  readonly occupancy: readonly OfficeOccupancy[];
  readonly reservations: readonly OfficeReservation[];
  readonly visibleEventIds: readonly string[];
  readonly cameraTarget: OfficeCameraTarget;
  readonly traceHash: string;
};

export type OfficeFrame = {
  readonly simulation: OfficeSimulationState;
  readonly previousSimulation: OfficeSimulationState;
  readonly accumulatorMs: number;
  readonly interpolation: number;
};
