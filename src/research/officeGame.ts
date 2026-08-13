import { Application, Assets, Container, Sprite, type Texture } from "pixi.js";
import type { Locale } from "../lib/i18n";
import {
  createAgentRuntime,
  type MutableAgentDisplayRuntime,
} from "./officeGameAgent";
import {
  furnitureStatesForSnapshot,
  type OfficeFurnitureRenderState,
} from "./officeGameFurniture";
import {
  type OfficeCameraTransform,
  type OfficeRendererCameraMode,
  type OfficeRenderSnapshot,
  renderOfficeSnapshot,
} from "./officeRenderer";
import { createOfficeSceneEntities } from "./officeRendererPixiEntities";
import { createOfficeFurnitureRuntime } from "./officeRendererPixiFurniture";
import { applyOfficeProjection } from "./officeRendererPixiProjection";
import { createOfficeRoomPlaques } from "./officeRendererPixiRoomPlaques";
import type { OfficeActorUiLayout } from "./officeRendererUiLayout";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import {
  createOfficeSimulation,
  type OfficeSimulationSnapshot,
  officeSimulationSnapshot,
} from "./officeSimulation";
import type { AgentId, AgentProfile } from "./types";

export type OfficeGameInspection = {
  readonly render: OfficeRenderSnapshot;
  readonly furniture: readonly OfficeFurnitureRenderState[];
  readonly ui: readonly OfficeActorUiLayout[];
};

export type OfficeCameraControlMode = "automatic" | "free" | "overview";

export type OfficeSnapshotRenderOptions = {
  readonly previousSnapshot?: OfficeSimulationSnapshot;
  readonly interpolation?: number;
  readonly cameraMode?: OfficeRendererCameraMode;
  readonly cameraActorIds?: readonly AgentId[];
  readonly liveBubble?: {
    readonly actorId: AgentId;
    readonly message: string;
  };
  readonly liveBubbles?: readonly {
    readonly actorId: AgentId;
    readonly message: string;
  }[];
  readonly conversation?: {
    readonly speakerId: AgentId;
    readonly participantIds: readonly AgentId[];
  };
};

export type OfficeGameController = {
  readonly renderSnapshot: (
    snapshot: OfficeSimulationSnapshot,
    options?: OfficeSnapshotRenderOptions,
  ) => OfficeRenderSnapshot;
  readonly setCameraMode: (mode: OfficeRendererCameraMode) => void;
  readonly setCameraControlMode: (mode: OfficeCameraControlMode) => void;
  readonly inspect: () => OfficeGameInspection;
  readonly setPaused: (isPaused: boolean) => void;
  readonly destroy: () => void;
};

export type OfficeSnapshotRendererOptions = {
  readonly host: HTMLDivElement;
  readonly locale: Locale;
  readonly reducedMotion: boolean;
  readonly showActorUi?: boolean;
  readonly showActorBubbles?: boolean;
  readonly onActorSelect?: (actorId: AgentId) => void;
  readonly signal: AbortSignal;
};

function viewportFor(host: HTMLDivElement) {
  return Object.freeze({
    width: Math.max(1, host.clientWidth || OFFICE_SCENE_MANIFEST.world.width),
    height: Math.max(
      1,
      host.clientHeight || OFFICE_SCENE_MANIFEST.world.height,
    ),
  });
}

const MOBILE_CAMERA_MAX_WIDTH = 767;
const MOBILE_CAMERA_RESPONSE_MS = 150;
const DESKTOP_CAMERA_RESPONSE_MS = 360;
const MAX_FREE_CAMERA_SCALE = 2.4;

type ScreenPoint = { readonly x: number; readonly y: number };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function constrainFreeCamera(
  camera: OfficeCameraTransform,
  viewport: { readonly width: number; readonly height: number },
): OfficeCameraTransform {
  const world = OFFICE_SCENE_MANIFEST.world;
  const minimumScale = Math.min(
    viewport.width / world.width,
    viewport.height / world.height,
  );
  const scale = clamp(camera.scale, minimumScale, MAX_FREE_CAMERA_SCALE);
  const scaledWidth = world.width * scale;
  const scaledHeight = world.height * scale;
  const x =
    scaledWidth <= viewport.width
      ? (viewport.width - scaledWidth) / 2
      : clamp(camera.x, viewport.width - scaledWidth, 0);
  const y =
    scaledHeight <= viewport.height
      ? (viewport.height - scaledHeight) / 2
      : clamp(camera.y, viewport.height - scaledHeight, 0);
  return Object.freeze({
    ...camera,
    mode: "focus",
    x,
    y,
    scale,
    visibleWorldBounds: Object.freeze({
      left: clamp(-x / scale, 0, world.width),
      top: clamp(-y / scale, 0, world.height),
      right: clamp((viewport.width - x) / scale, 0, world.width),
      bottom: clamp((viewport.height - y) / scale, 0, world.height),
    }),
  });
}

export function zoomFreeCameraAt(
  camera: OfficeCameraTransform,
  viewport: { readonly width: number; readonly height: number },
  anchor: ScreenPoint,
  scaleFactor: number,
): OfficeCameraTransform {
  const nextScale = camera.scale * scaleFactor;
  const worldX = (anchor.x - camera.x) / camera.scale;
  const worldY = (anchor.y - camera.y) / camera.scale;
  return constrainFreeCamera(
    {
      ...camera,
      x: anchor.x - worldX * nextScale,
      y: anchor.y - worldY * nextScale,
      scale: nextScale,
    },
    viewport,
  );
}

function cameraClose(
  current: OfficeCameraTransform,
  target: OfficeCameraTransform,
): boolean {
  return (
    Math.abs(current.x - target.x) < 0.35 &&
    Math.abs(current.y - target.y) < 0.35 &&
    Math.abs(current.scale - target.scale) < 0.001
  );
}

function cameraStep(
  current: OfficeCameraTransform,
  target: OfficeCameraTransform,
  deltaMs: number,
  responseMs: number,
): OfficeCameraTransform {
  const progress = 1 - Math.exp(-Math.max(1, deltaMs) / responseMs);
  return Object.freeze({
    ...target,
    x: current.x + (target.x - current.x) * progress,
    y: current.y + (target.y - current.y) * progress,
    scale: current.scale + (target.scale - current.scale) * progress,
  });
}

function projectionAtCamera(
  projection: OfficeRenderSnapshot,
  camera: OfficeCameraTransform,
): OfficeRenderSnapshot {
  return Object.freeze({ ...projection, camera });
}

export function officeRendererResolution(devicePixelRatio: number): number {
  return Math.min(Math.max(devicePixelRatio, 1), 2);
}

export async function createOfficeSnapshotRenderer(
  options: OfficeSnapshotRendererOptions,
): Promise<OfficeGameController> {
  const {
    host,
    locale,
    reducedMotion,
    showActorUi = true,
    showActorBubbles = true,
    onActorSelect,
    signal,
  } = options;
  const viewport = viewportFor(host);
  const app = new Application();
  let initialized = false;
  try {
    await app.init({
      width: viewport.width,
      height: viewport.height,
      antialias: true,
      backgroundColor: 0x05070a,
      autoDensity: true,
      resolution: officeRendererResolution(window.devicePixelRatio),
      roundPixels: true,
    });
    initialized = true;
    signal.throwIfAborted();
    app.canvas.className = "office-game__canvas";
    app.canvas.setAttribute("aria-hidden", "true");
    host.appendChild(app.canvas);

    const world = new Container();
    world.sortableChildren = true;
    const uiLayer = new Container();
    uiLayer.sortableChildren = true;
    uiLayer.visible = showActorUi;
    app.stage.addChild(world, uiLayer);
    host.setAttribute("data-actor-ui", showActorUi ? "visible" : "hidden");
    const backgroundTexture = await Assets.load<Texture>(
      OFFICE_SCENE_MANIFEST.assets.base,
    );
    signal.throwIfAborted();
    backgroundTexture.source.scaleMode = "linear";
    const background = new Sprite(backgroundTexture);
    background.zIndex = -1;
    world.addChild(background);
    const sceneEntities = await createOfficeSceneEntities(world);
    host.setAttribute("data-office-entity-count", String(sceneEntities.length));
    const roomPlaques = await createOfficeRoomPlaques(world, locale);
    host.setAttribute("data-room-plaque-count", String(roomPlaques.length));
    host.setAttribute("data-room-plaque-locale", locale);
    signal.throwIfAborted();

    const initialSnapshot = officeSimulationSnapshot(
      createOfficeSimulation({ reducedMotion }),
    );
    let furnitureStates = furnitureStatesForSnapshot(initialSnapshot);
    const furniture = await createOfficeFurnitureRuntime(
      world,
      furnitureStates,
    );
    signal.throwIfAborted();
    let cameraControlMode: OfficeCameraControlMode = "automatic";
    let lastCameraGestureAt = 0;
    const loadedActors = await Promise.all(
      OFFICE_SCENE_MANIFEST.roster.map((member) =>
        createAgentRuntime(member, locale),
      ),
    );
    signal.throwIfAborted();
    const actors = new Map<AgentId, MutableAgentDisplayRuntime>();
    for (const runtime of loadedActors) {
      actors.set(runtime.id, runtime);
      if (onActorSelect !== undefined) {
        runtime.body.eventMode = "static";
        runtime.body.cursor = "pointer";
        runtime.body.on("pointertap", () => {
          if (performance.now() - lastCameraGestureAt > 240)
            onActorSelect(runtime.id);
        });
      }
      world.addChild(runtime.body);
      uiLayer.addChild(runtime.ui);
    }

    let cameraMode: OfficeRendererCameraMode = "overview";
    let lastSnapshot = initialSnapshot;
    let lastCameraActorIds: OfficeSnapshotRenderOptions["cameraActorIds"];
    let lastLiveBubble: OfficeSnapshotRenderOptions["liveBubble"];
    let lastLiveBubbles: OfficeSnapshotRenderOptions["liveBubbles"];
    let lastConversation: OfficeSnapshotRenderOptions["conversation"];
    let lastRender = renderOfficeSnapshot({
      snapshot: initialSnapshot,
      viewport,
      locale,
      reducedMotion,
      cameraMode,
    });
    let lastUiLayout: readonly OfficeActorUiLayout[] = Object.freeze([]);
    let destroyed = false;
    let renderFrameCount = 0;
    let latestProjection = lastRender;
    let displayedCamera = lastRender.camera;
    let targetCamera = lastRender.camera;
    let freeCamera: OfficeCameraTransform | undefined;
    let cameraAnimationFrame: number | undefined;
    let previousCameraTimestamp: number | undefined;
    const activePointers = new Map<number, ScreenPoint>();
    let previousGesture:
      | { readonly center: ScreenPoint; readonly distance?: number }
      | undefined;

    const renderDisplayedProjection = (
      projection: OfficeRenderSnapshot,
    ): void => {
      lastUiLayout = applyOfficeProjection({
        projection: projectionAtCamera(projection, displayedCamera),
        viewport: viewportFor(host),
        actors,
        furniture,
        furnitureStates,
        world,
        host,
        showActorBubbles,
      });
    };
    const animateFocusCamera = (timestamp: number): void => {
      cameraAnimationFrame = undefined;
      if (destroyed || cameraControlMode === "free") return;
      const deltaMs =
        previousCameraTimestamp === undefined
          ? 16
          : Math.min(64, timestamp - previousCameraTimestamp);
      previousCameraTimestamp = timestamp;
      displayedCamera = cameraStep(
        displayedCamera,
        targetCamera,
        deltaMs,
        viewportFor(host).width <= MOBILE_CAMERA_MAX_WIDTH
          ? MOBILE_CAMERA_RESPONSE_MS
          : DESKTOP_CAMERA_RESPONSE_MS,
      );
      if (cameraClose(displayedCamera, targetCamera)) {
        displayedCamera = targetCamera;
        previousCameraTimestamp = undefined;
      }
      renderDisplayedProjection(latestProjection);
      if (!cameraClose(displayedCamera, targetCamera))
        cameraAnimationFrame = window.requestAnimationFrame(animateFocusCamera);
    };
    const applyProjection = (projection: OfficeRenderSnapshot): void => {
      latestProjection = projection;
      if (cameraControlMode === "free") {
        if (cameraAnimationFrame !== undefined)
          window.cancelAnimationFrame(cameraAnimationFrame);
        cameraAnimationFrame = undefined;
        previousCameraTimestamp = undefined;
        freeCamera = constrainFreeCamera(
          freeCamera ?? displayedCamera,
          viewportFor(host),
        );
        displayedCamera = freeCamera;
        targetCamera = freeCamera;
      } else {
        targetCamera = projection.camera;
      }
      const animatedFocus =
        cameraControlMode !== "free" &&
        targetCamera.mode === "focus" &&
        !reducedMotion;
      if (!animatedFocus) {
        if (cameraAnimationFrame !== undefined)
          window.cancelAnimationFrame(cameraAnimationFrame);
        cameraAnimationFrame = undefined;
        previousCameraTimestamp = undefined;
        displayedCamera = targetCamera;
      }
      renderDisplayedProjection(projection);
      if (
        animatedFocus &&
        !cameraClose(displayedCamera, targetCamera) &&
        cameraAnimationFrame === undefined
      )
        cameraAnimationFrame = window.requestAnimationFrame(animateFocusCamera);
      renderFrameCount += 1;
      host.setAttribute("data-render-frame-count", String(renderFrameCount));
    };
    const renderSnapshot = (
      snapshot: OfficeSimulationSnapshot,
      renderOptions: OfficeSnapshotRenderOptions = {},
    ): OfficeRenderSnapshot => {
      cameraMode = renderOptions.cameraMode ?? cameraMode;
      lastCameraActorIds = renderOptions.cameraActorIds;
      furnitureStates = furnitureStatesForSnapshot(snapshot);
      const projection = renderOfficeSnapshot({
        snapshot,
        previousSnapshot: renderOptions.previousSnapshot ?? lastSnapshot,
        interpolation: renderOptions.interpolation ?? 1,
        reducedMotion,
        cameraMode,
        ...(renderOptions.cameraActorIds === undefined
          ? {}
          : { cameraActorIds: renderOptions.cameraActorIds }),
        viewport: viewportFor(host),
        locale,
        ...(renderOptions.liveBubble === undefined
          ? {}
          : { liveBubble: renderOptions.liveBubble }),
        ...(renderOptions.liveBubbles === undefined
          ? {}
          : { liveBubbles: renderOptions.liveBubbles }),
        ...(renderOptions.conversation === undefined
          ? {}
          : { conversation: renderOptions.conversation }),
      });
      lastSnapshot = snapshot;
      lastLiveBubble = renderOptions.liveBubble;
      lastLiveBubbles = renderOptions.liveBubbles;
      lastConversation = renderOptions.conversation;
      lastRender = projection;
      applyProjection(projection);
      return projection;
    };
    applyProjection(lastRender);

    const gestureForPointers = () => {
      const points = [...activePointers.values()].slice(0, 2);
      const first = points[0];
      if (first === undefined) return undefined;
      const second = points[1];
      if (second === undefined) return { center: first };
      return {
        center: {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2,
        },
        distance: Math.hypot(second.x - first.x, second.y - first.y),
      };
    };
    const applyFreeCamera = (camera: OfficeCameraTransform): void => {
      freeCamera = constrainFreeCamera(camera, viewportFor(host));
      displayedCamera = freeCamera;
      targetCamera = freeCamera;
      renderDisplayedProjection(latestProjection);
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (cameraControlMode !== "free") return;
      event.preventDefault();
      app.canvas.setPointerCapture(event.pointerId);
      activePointers.set(event.pointerId, {
        x: event.offsetX,
        y: event.offsetY,
      });
      previousGesture = gestureForPointers();
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (
        cameraControlMode !== "free" ||
        !activePointers.has(event.pointerId) ||
        freeCamera === undefined
      )
        return;
      event.preventDefault();
      activePointers.set(event.pointerId, {
        x: event.offsetX,
        y: event.offsetY,
      });
      const currentGesture = gestureForPointers();
      const previous = previousGesture;
      previousGesture = currentGesture;
      if (currentGesture === undefined || previous === undefined) return;
      const deltaX = currentGesture.center.x - previous.center.x;
      const deltaY = currentGesture.center.y - previous.center.y;
      let nextCamera = constrainFreeCamera(
        {
          ...freeCamera,
          x: freeCamera.x + deltaX,
          y: freeCamera.y + deltaY,
        },
        viewportFor(host),
      );
      if (
        currentGesture.distance !== undefined &&
        previous.distance !== undefined &&
        previous.distance > 0
      )
        nextCamera = zoomFreeCameraAt(
          nextCamera,
          viewportFor(host),
          currentGesture.center,
          currentGesture.distance / previous.distance,
        );
      if (
        Math.abs(deltaX) > 1 ||
        Math.abs(deltaY) > 1 ||
        currentGesture.distance !== previous.distance
      )
        lastCameraGestureAt = performance.now();
      applyFreeCamera(nextCamera);
    };
    const releasePointer = (event: PointerEvent): void => {
      activePointers.delete(event.pointerId);
      previousGesture = gestureForPointers();
      if (app.canvas.hasPointerCapture(event.pointerId))
        app.canvas.releasePointerCapture(event.pointerId);
    };
    const onWheel = (event: WheelEvent): void => {
      if (cameraControlMode !== "free" || freeCamera === undefined) return;
      event.preventDefault();
      lastCameraGestureAt = performance.now();
      applyFreeCamera(
        zoomFreeCameraAt(
          freeCamera,
          viewportFor(host),
          { x: event.offsetX, y: event.offsetY },
          Math.exp(-event.deltaY * 0.002),
        ),
      );
    };
    app.canvas.addEventListener("pointerdown", onPointerDown);
    app.canvas.addEventListener("pointermove", onPointerMove);
    app.canvas.addEventListener("pointerup", releasePointer);
    app.canvas.addEventListener("pointercancel", releasePointer);
    app.canvas.addEventListener("wheel", onWheel, { passive: false });

    const resizeObserver = new ResizeObserver(() => {
      const nextViewport = viewportFor(host);
      app.renderer.resize(nextViewport.width, nextViewport.height);
      renderSnapshot(lastSnapshot, {
        previousSnapshot: lastSnapshot,
        cameraMode,
        ...(lastCameraActorIds === undefined
          ? {}
          : { cameraActorIds: lastCameraActorIds }),
        ...(lastLiveBubble === undefined ? {} : { liveBubble: lastLiveBubble }),
        ...(lastLiveBubbles === undefined
          ? {}
          : { liveBubbles: lastLiveBubbles }),
        ...(lastConversation === undefined
          ? {}
          : { conversation: lastConversation }),
      });
    });
    resizeObserver.observe(host);

    return Object.freeze({
      renderSnapshot,
      setCameraMode(mode: OfficeRendererCameraMode) {
        renderSnapshot(lastSnapshot, {
          previousSnapshot: lastSnapshot,
          cameraMode: mode,
          ...(lastCameraActorIds === undefined
            ? {}
            : { cameraActorIds: lastCameraActorIds }),
          ...(lastLiveBubble === undefined
            ? {}
            : { liveBubble: lastLiveBubble }),
          ...(lastLiveBubbles === undefined
            ? {}
            : { liveBubbles: lastLiveBubbles }),
          ...(lastConversation === undefined
            ? {}
            : { conversation: lastConversation }),
        });
      },
      setCameraControlMode(mode: OfficeCameraControlMode) {
        cameraControlMode = mode;
        activePointers.clear();
        previousGesture = undefined;
        host.setAttribute("data-camera-control-mode", mode);
        app.canvas.style.touchAction = mode === "free" ? "none" : "pan-y";
        if (mode === "free") {
          if (cameraAnimationFrame !== undefined)
            window.cancelAnimationFrame(cameraAnimationFrame);
          cameraAnimationFrame = undefined;
          previousCameraTimestamp = undefined;
          applyFreeCamera(displayedCamera);
        } else {
          freeCamera = undefined;
        }
      },
      inspect() {
        return Object.freeze({
          render: lastRender,
          furniture: furnitureStates,
          ui: lastUiLayout,
        });
      },
      setPaused(isPaused: boolean) {
        if (isPaused) app.stop();
        else app.start();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        if (cameraAnimationFrame !== undefined)
          window.cancelAnimationFrame(cameraAnimationFrame);
        app.canvas.removeEventListener("pointerdown", onPointerDown);
        app.canvas.removeEventListener("pointermove", onPointerMove);
        app.canvas.removeEventListener("pointerup", releasePointer);
        app.canvas.removeEventListener("pointercancel", releasePointer);
        app.canvas.removeEventListener("wheel", onWheel);
        resizeObserver.disconnect();
        host.removeAttribute("data-room-plaque-count");
        host.removeAttribute("data-room-plaque-locale");
        host.removeAttribute("data-actor-ui");
        host.removeAttribute("data-office-entity-count");
        app.destroy({ removeView: true }, { children: true });
      },
    });
  } catch (error) {
    if (initialized) {
      app.destroy({ removeView: true }, { children: true });
    }
    throw error;
  }
}

export async function createOfficeGame(
  host: HTMLDivElement,
  profiles: readonly AgentProfile[],
  locale: Locale,
  reducedMotion: boolean,
  signal: AbortSignal,
): Promise<OfficeGameController> {
  void profiles;
  return createOfficeSnapshotRenderer({
    host,
    locale,
    reducedMotion,
    signal,
  });
}
