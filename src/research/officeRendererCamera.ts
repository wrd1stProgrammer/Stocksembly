import { ACTOR_ATLAS } from "./officeActorAtlas";
import type { OfficeCameraTarget } from "./officeChoreography";
import type { OfficeManifestAgentId, WorldPoint } from "./officeSceneManifest";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

export type OfficeRendererCameraMode = "focus" | "overview" | "snapshot";

export type OfficeRendererViewport = {
  readonly width: number;
  readonly height: number;
};

export type OfficeWorldBounds = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

export type OfficeCameraTransform = {
  readonly mode: "focus" | "overview";
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly activeBounds: OfficeWorldBounds;
  readonly visibleWorldBounds: OfficeWorldBounds;
};

type CameraActor = {
  readonly id: OfficeManifestAgentId;
  readonly world: WorldPoint;
};

type OfficeCameraInput = {
  readonly mode: OfficeRendererCameraMode;
  readonly snapshotTarget: OfficeCameraTarget;
  readonly actors: readonly CameraActor[];
  readonly viewport: OfficeRendererViewport;
};

// Keep enough of the room visible that a change of speaker reads as a camera
// reframe rather than a teleport.  The previous 2× crop magnified ordinary
// one-cell motion and made department hand-offs feel frantic.
const CAMERA_PADDING = 96;
const MAX_FOCUS_SCALE = 1.45;
const ACTOR_UI_TOP = ACTOR_ATLAS.footPivot.y + 20;
const ACTOR_BOTTOM = ACTOR_ATLAS.frame.height - ACTOR_ATLAS.footPivot.y;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function overviewCamera(
  viewport: OfficeRendererViewport,
): OfficeCameraTransform {
  const { width, height } = OFFICE_SCENE_MANIFEST.world;
  const scale = Math.min(viewport.width / width, viewport.height / height);
  return Object.freeze({
    mode: "overview",
    x: (viewport.width - width * scale) / 2,
    y: (viewport.height - height * scale) / 2,
    scale,
    activeBounds: Object.freeze({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
    }),
    visibleWorldBounds: Object.freeze({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
    }),
  });
}

function focusCamera(
  viewport: OfficeRendererViewport,
  points: readonly WorldPoint[],
): OfficeCameraTransform {
  const world = OFFICE_SCENE_MANIFEST.world;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const activeBounds = Object.freeze({
    left: clamp(minX - CAMERA_PADDING, 0, world.width),
    top: clamp(minY - CAMERA_PADDING, 0, world.height),
    right: clamp(maxX + CAMERA_PADDING, 0, world.width),
    bottom: clamp(maxY + CAMERA_PADDING, 0, world.height),
  });
  const framingBounds = Object.freeze({
    left: clamp(
      Math.min(activeBounds.left, minX - ACTOR_ATLAS.footPivot.x),
      0,
      world.width,
    ),
    top: clamp(
      Math.min(activeBounds.top, minY - ACTOR_UI_TOP),
      0,
      world.height,
    ),
    right: clamp(
      Math.max(
        activeBounds.right,
        maxX + ACTOR_ATLAS.frame.width - ACTOR_ATLAS.footPivot.x,
      ),
      0,
      world.width,
    ),
    bottom: clamp(
      Math.max(activeBounds.bottom, maxY + ACTOR_BOTTOM),
      0,
      world.height,
    ),
  });
  const activeWidth = Math.max(1, framingBounds.right - framingBounds.left);
  const activeHeight = Math.max(1, framingBounds.bottom - framingBounds.top);
  const scale = Math.min(
    viewport.width / activeWidth,
    viewport.height / activeHeight,
    MAX_FOCUS_SCALE,
  );
  const viewWidth = viewport.width / scale;
  const viewHeight = viewport.height / scale;
  const centerX = (framingBounds.left + framingBounds.right) / 2;
  const centerY = (framingBounds.top + framingBounds.bottom) / 2;
  const left =
    viewWidth >= world.width
      ? (world.width - viewWidth) / 2
      : clamp(centerX - viewWidth / 2, 0, world.width - viewWidth);
  const top =
    viewHeight >= world.height
      ? (world.height - viewHeight) / 2
      : clamp(centerY - viewHeight / 2, 0, world.height - viewHeight);
  return Object.freeze({
    mode: "focus",
    x: -left * scale,
    y: -top * scale,
    scale,
    activeBounds,
    visibleWorldBounds: Object.freeze({
      left: clamp(left, 0, world.width),
      top: clamp(top, 0, world.height),
      right: clamp(left + viewWidth, 0, world.width),
      bottom: clamp(top + viewHeight, 0, world.height),
    }),
  });
}

export function officeCameraTransform(
  input: OfficeCameraInput,
): OfficeCameraTransform {
  const cameraKind =
    input.mode === "snapshot" ? input.snapshotTarget.kind : input.mode;
  if (cameraKind === "overview") return overviewCamera(input.viewport);
  const targetIds =
    input.snapshotTarget.kind === "actors"
      ? new Set(input.snapshotTarget.actorIds)
      : undefined;
  const focusedActors = targetIds
    ? input.actors.filter((actor) => targetIds.has(actor.id))
    : input.actors;
  const points = focusedActors.length > 0 ? focusedActors : input.actors;
  return focusCamera(
    input.viewport,
    points.map((actor) => actor.world),
  );
}
