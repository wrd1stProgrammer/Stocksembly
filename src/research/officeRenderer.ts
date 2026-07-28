import type { Locale } from "../lib/i18n";
import { ACTOR_ATLAS, actorFrame } from "./officeActorAtlas";
import type { OfficeActorAction, OfficeBeatId } from "./officeChoreography";
import { assertNeverOffice } from "./officeChoreographyV7Contract";
import { bubbleStateForSnapshot } from "./officeGameBubbleState";
import {
  type OfficeCameraTransform,
  type OfficeRendererCameraMode,
  type OfficeRendererViewport,
  officeCameraTransform,
} from "./officeRendererCamera";
import type {
  Cell,
  OfficeFacing,
  OfficeManifestAgentId,
  WorldPoint,
} from "./officeSceneManifest";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import type { OfficeSimulationSnapshot } from "./officeSimulation";

export type {
  OfficeCameraTransform,
  OfficeRendererCameraMode,
  OfficeRendererViewport,
  OfficeWorldBounds,
} from "./officeRendererCamera";

export type OfficeRenderActor = {
  readonly id: OfficeManifestAgentId;
  readonly active: boolean;
  readonly action: OfficeActorAction;
  readonly destination: Cell;
  readonly revision: number;
  readonly world: WorldPoint;
  readonly facing: OfficeFacing;
  readonly animation: "idle" | "sit" | "walk";
  readonly frame: { readonly row: number; readonly columns: readonly number[] };
  readonly pivot: WorldPoint;
  readonly scale: 1;
  readonly zIndex: number;
  readonly assetPath: string;
  readonly label: string;
  readonly bubble: { readonly visible: boolean; readonly message: string };
};

export type OfficeRenderSnapshot = {
  readonly tick: number;
  readonly beatId: OfficeBeatId;
  readonly actors: readonly OfficeRenderActor[];
  readonly camera: OfficeCameraTransform;
};

export type OfficeRendererInput = {
  readonly snapshot: OfficeSimulationSnapshot;
  readonly previousSnapshot?: OfficeSimulationSnapshot;
  readonly interpolation?: number;
  readonly reducedMotion?: boolean;
  readonly cameraMode?: OfficeRendererCameraMode;
  readonly viewport: OfficeRendererViewport;
  readonly locale: Locale;
  readonly liveBubble?: {
    readonly actorId: OfficeManifestAgentId;
    readonly message: string;
  };
};

const walkColumns = Object.freeze([0, 1, 2, 1]);
const rosterIndex = new Map(
  OFFICE_SCENE_MANIFEST.roster.map((member, index) => [member.id, index]),
);
const rosterMember = new Map(
  OFFICE_SCENE_MANIFEST.roster.map((member) => [member.id, member]),
);
const seatedActorLayer = {
  up: 2,
  down: 1,
  left: 3,
  right: 3,
} as const satisfies Readonly<Record<OfficeFacing, number>>;

function animationFor(action: OfficeActorAction): "idle" | "sit" | "walk" {
  switch (action) {
    case "seated-work":
      return "sit";
    case "return":
    case "walk":
      return "walk";
    case "chair-synthesis":
    case "idle":
    case "listen":
    case "orient":
    case "present":
    case "stand":
    case "summarize":
    case "talk":
      return "idle";
    default:
      return assertNeverOffice(action);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function actorWorld(
  current: WorldPoint,
  previous: WorldPoint | undefined,
  interpolation: number,
  reducedMotion: boolean,
): WorldPoint {
  if (reducedMotion || !previous) return Object.freeze({ ...current });
  const progress = clamp(interpolation, 0, 1);
  return Object.freeze({
    x: previous.x + (current.x - previous.x) * progress,
    y: previous.y + (current.y - previous.y) * progress,
  });
}

export function renderOfficeSnapshot(
  input: OfficeRendererInput,
): OfficeRenderSnapshot {
  const requestedMode = input.cameraMode ?? "snapshot";
  const focusedIds =
    requestedMode !== "overview" &&
    input.snapshot.cameraTarget.kind === "actors"
      ? new Set(input.snapshot.cameraTarget.actorIds)
      : undefined;
  const previousById = new Map(
    input.previousSnapshot?.actors.map((actor) => [actor.id, actor]) ?? [],
  );
  const actors = Object.freeze(
    input.snapshot.actors.map((actor) => {
      const member = rosterMember.get(actor.id);
      const index = rosterIndex.get(actor.id);
      if (!member || index === undefined) {
        throw new RangeError(`Manifest has no actor ${actor.id}`);
      }
      const previous = previousById.get(actor.id);
      const world = actorWorld(
        actor.world,
        previous?.world,
        input.interpolation ?? 1,
        input.reducedMotion ?? false,
      );
      const animation = animationFor(actor.action);
      const facing = actor.facing;
      const frame = actorFrame(animation, facing, 0);
      const layer = animation === "sit" ? seatedActorLayer[facing] : 2;
      return Object.freeze({
        id: actor.id,
        active: focusedIds?.has(actor.id) ?? true,
        action: actor.action,
        destination: Object.freeze({ ...actor.destination }),
        revision: actor.revision,
        world,
        facing,
        animation,
        frame: Object.freeze({
          row: frame.row,
          columns:
            animation === "walk" ? walkColumns : Object.freeze([frame.column]),
        }),
        pivot: Object.freeze({ ...ACTOR_ATLAS.footPivot }),
        scale: 1,
        zIndex: Math.round(world.y * 1000) + layer * 100 + index,
        assetPath: `${OFFICE_SCENE_MANIFEST.assets.actorsRoot}/${actor.id}.png`,
        label: member.name[input.locale],
        bubble: Object.freeze(
          input.liveBubble === undefined
            ? bubbleStateForSnapshot(actor, input.snapshot, input.locale)
            : actor.id === input.liveBubble.actorId
              ? { visible: true, message: input.liveBubble.message }
              : { visible: false, message: "" },
        ),
      });
    }),
  );
  const camera = officeCameraTransform({
    mode: requestedMode,
    snapshotTarget: input.snapshot.cameraTarget,
    actors,
    viewport: input.viewport,
  });
  return Object.freeze({
    tick: input.snapshot.tick,
    beatId: input.snapshot.beatId,
    actors,
    camera,
  });
}
