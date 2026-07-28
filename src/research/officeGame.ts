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
  type OfficeRendererCameraMode,
  type OfficeRenderSnapshot,
  renderOfficeSnapshot,
} from "./officeRenderer";
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

export type OfficeSnapshotRenderOptions = {
  readonly previousSnapshot?: OfficeSimulationSnapshot;
  readonly interpolation?: number;
  readonly cameraMode?: OfficeRendererCameraMode;
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
    const roomPlaques = await createOfficeRoomPlaques(world, locale);
    host.setAttribute("data-room-plaque-count", String(roomPlaques.length));
    host.setAttribute("data-room-plaque-locale", locale);
    signal.throwIfAborted();

    const initialSnapshot = officeSimulationSnapshot(
      createOfficeSimulation({ reducedMotion }),
    );
    let furnitureStates = furnitureStatesForSnapshot(initialSnapshot);
    const furniture = createOfficeFurnitureRuntime(world, furnitureStates);
    signal.throwIfAborted();
    const loadedActors = await Promise.all(
      OFFICE_SCENE_MANIFEST.roster.map((member) =>
        createAgentRuntime(member, locale),
      ),
    );
    signal.throwIfAborted();
    const actors = new Map<AgentId, MutableAgentDisplayRuntime>();
    for (const runtime of loadedActors) {
      actors.set(runtime.id, runtime);
      world.addChild(runtime.body);
      uiLayer.addChild(runtime.ui);
    }

    let cameraMode: OfficeRendererCameraMode = "snapshot";
    let lastSnapshot = initialSnapshot;
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
    const applyProjection = (projection: OfficeRenderSnapshot): void => {
      lastUiLayout = applyOfficeProjection({
        projection,
        viewport: viewportFor(host),
        actors,
        furniture,
        furnitureStates,
        world,
        host,
        showActorBubbles,
      });
      renderFrameCount += 1;
      host.setAttribute("data-render-frame-count", String(renderFrameCount));
    };
    const renderSnapshot = (
      snapshot: OfficeSimulationSnapshot,
      renderOptions: OfficeSnapshotRenderOptions = {},
    ): OfficeRenderSnapshot => {
      cameraMode = renderOptions.cameraMode ?? cameraMode;
      furnitureStates = furnitureStatesForSnapshot(snapshot);
      const projection = renderOfficeSnapshot({
        snapshot,
        previousSnapshot: renderOptions.previousSnapshot ?? lastSnapshot,
        interpolation: renderOptions.interpolation ?? 1,
        reducedMotion,
        cameraMode,
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

    const resizeObserver = new ResizeObserver(() => {
      const nextViewport = viewportFor(host);
      app.renderer.resize(nextViewport.width, nextViewport.height);
      renderSnapshot(lastSnapshot, {
        previousSnapshot: lastSnapshot,
        cameraMode,
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
        resizeObserver.disconnect();
        host.removeAttribute("data-room-plaque-count");
        host.removeAttribute("data-room-plaque-locale");
        host.removeAttribute("data-actor-ui");
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
