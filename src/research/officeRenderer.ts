import type { Locale } from "../lib/i18n";
import { ACTOR_ATLAS, actorFrame, actorWalkColumns } from "./officeActorAtlas";
import type { OfficeActorAction, OfficeBeatId } from "./officeChoreography";
import { assertNeverOffice } from "./officeChoreographyV7Contract";
import { facingToward } from "./officeFacingV7";
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
  readonly liveBubbles?: readonly {
    readonly actorId: OfficeManifestAgentId;
    readonly message: string;
  }[];
  readonly conversation?: {
    readonly speakerId: OfficeManifestAgentId;
    readonly participantIds: readonly OfficeManifestAgentId[];
  };
};

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

function directionBetweenCells(from: Cell, to: Cell): OfficeFacing | undefined {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (Math.abs(deltaX) + Math.abs(deltaY) !== 1) return undefined;
  if (deltaX < 0) return "left";
  if (deltaX > 0) return "right";
  if (deltaY < 0) return "up";
  if (deltaY > 0) return "down";
  return undefined;
}

function actorWorld(
  current: WorldPoint,
  previous: WorldPoint | undefined,
  currentCell: Cell,
  previousCell: Cell | undefined,
  interpolation: number,
  reducedMotion: boolean,
): WorldPoint {
  if (reducedMotion || !previous) return Object.freeze({ ...current });
  // A normal simulation step reserves at most one cardinal cell.  If a
  // directive, recovery or reduced-motion update ever changes more than one
  // cell between snapshots, interpolating it would draw the actor through a
  // wall (the visible "teleport after walking in place" artefact).  Snap to
  // the authoritative cell instead and let the next valid reservation resume
  // interpolation.
  if (
    previousCell !== undefined &&
    Math.abs(currentCell.x - previousCell.x) +
      Math.abs(currentCell.y - previousCell.y) >
      1
  ) {
    return Object.freeze({ ...current });
  }
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
  const actorById = new Map(
    input.snapshot.actors.map((actor) => [actor.id, actor]),
  );
  const conversationIds = new Set(input.conversation?.participantIds ?? []);
  const liveBubbles = new Map(
    input.liveBubbles?.map((bubble) => [bubble.actorId, bubble.message]) ?? [],
  );
  const actors = Object.freeze(
    input.snapshot.actors.map((actor) => {
      const member = rosterMember.get(actor.id);
      const index = rosterIndex.get(actor.id);
      if (!member || index === undefined) {
        throw new RangeError(`Manifest has no actor ${actor.id}`);
      }
      const previous = previousById.get(actor.id);
      const interpolatedWorld = actorWorld(
        actor.world,
        previous?.world,
        actor.cell,
        previous?.cell,
        input.interpolation ?? 1,
        input.reducedMotion ?? false,
      );
      const counterpart = conversationIds.has(actor.id)
        ? [...conversationIds]
            .filter((id) => id !== actor.id)
            .map((id) => actorById.get(id))
            .filter((candidate) => candidate !== undefined)
            .sort((left, right) => {
              const leftDistance =
                Math.abs(left.world.x - actor.world.x) +
                Math.abs(left.world.y - actor.world.y);
              const rightDistance =
                Math.abs(right.world.x - actor.world.x) +
                Math.abs(right.world.y - actor.world.y);
              return leftDistance - rightDistance;
            })[0]
        : undefined;
      const moving = actor.action === "walk" || actor.action === "return";
      const action =
        counterpart === undefined || moving
          ? actor.action
          : actor.id === input.conversation?.speakerId
            ? "talk"
            : "listen";
      const atWorkSeat =
        actor.cell.x === member.seat.cell.x &&
        actor.cell.y === member.seat.cell.y &&
        (action === "idle" || action === "seated-work");
      const animation = atWorkSeat ? "sit" : animationFor(action);
      const enteringSeat =
        animation === "sit" &&
        previous !== undefined &&
        (previous.action === "walk" ||
          previous.action === "return" ||
          previous.action === "stand" ||
          previous.action === "orient") &&
        (previous.cell.x !== actor.cell.x || previous.cell.y !== actor.cell.y);
      // Do not render the final walking interpolation with a seated frame.
      // The seat is a semantic interaction point, so switching to the seated
      // pose snaps the feet to the chair and avoids the visible slide into it.
      const world = enteringSeat
        ? Object.freeze({ ...actor.world })
        : interpolatedWorld;
      const facing =
        counterpart === undefined
          ? actor.facing
          : facingToward(actor.cell, counterpart.cell);
      // A directive's final facing is a semantic state, not necessarily the
      // direction of the current step.  Prefer the authoritative adjacent
      // cell transition while a walk is being rendered so the sprite never
      // faces one way while its feet travel the other way.
      const movementFacing =
        animation === "walk" &&
        previous !== undefined &&
        (previous.cell.x !== actor.cell.x || previous.cell.y !== actor.cell.y)
          ? (directionBetweenCells(previous.cell, actor.cell) ?? facing)
          : facing;
      const renderFacing = animation === "walk" ? movementFacing : facing;
      const frame = actorFrame(animation, renderFacing, 0);
      const layer = animation === "sit" ? seatedActorLayer[facing] : 2;
      return Object.freeze({
        id: actor.id,
        active: focusedIds?.has(actor.id) ?? true,
        action,
        destination: Object.freeze({ ...actor.destination }),
        revision: actor.revision,
        world,
        facing: renderFacing,
        animation,
        frame: Object.freeze({
          row: frame.row,
          columns:
            animation === "walk"
              ? actorWalkColumns(movementFacing)
              : Object.freeze([frame.column]),
        }),
        pivot: Object.freeze({ ...ACTOR_ATLAS.footPivot }),
        scale: 1,
        zIndex: Math.round(world.y * 1000) + layer * 100 + index,
        assetPath: `${OFFICE_SCENE_MANIFEST.assets.actorsRoot}/${actor.id}.png`,
        label: member.name[input.locale],
        bubble: Object.freeze(
          input.liveBubbles !== undefined
            ? liveBubbles.has(actor.id)
              ? { visible: true, message: liveBubbles.get(actor.id) ?? "" }
              : { visible: false, message: "" }
            : input.liveBubble === undefined
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
