import { researchLocale } from "../../lib/i18n";
import { OfficeDialoguePlayer } from "../officeDialogue";
import type {
  OfficeCameraControlMode,
  OfficeGameController,
  OfficeSnapshotRendererOptions,
  OfficeSnapshotRenderOptions,
} from "../officeGame";
import {
  type OfficeRenderSnapshot,
  renderOfficeSnapshot,
} from "../officeRenderer";
import { officeCameraTransform } from "../officeRendererCamera";
import type { OfficeActorUiLayout } from "../officeRendererUiLayout";
import {
  createOfficeSimulation,
  type OfficeSimulationSnapshot,
  officeSimulationSnapshot,
} from "../officeSimulation";
import { MotionCamera, officeRendererResolution } from "./camera";
import { loadAssets } from "./canvasPrimitives";
import { drawWorld } from "./drawWorld";
import { motionFurniture } from "./inspection";
import { LiveOfficeScene } from "./liveScene";
import type { ActorId, SceneFrame } from "./types";
import { MotionUi } from "./ui";

export async function createOfficeMotionRenderer(
  options: OfficeSnapshotRendererOptions,
): Promise<OfficeGameController> {
  const {
    host,
    locale,
    reducedMotion,
    signal,
    showActorUi = true,
    showActorBubbles = true,
    onActorSelect,
  } = options;
  signal.throwIfAborted();
  const assets = await loadAssets();
  signal.throwIfAborted();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new RangeError("Office canvas is unavailable");
  const ctx: CanvasRenderingContext2D = context;
  canvas.className = "office-game__canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.touchAction = "pan-y";
  host.appendChild(canvas);
  const scene = new LiveOfficeScene();
  const dialoguePlayer = new OfficeDialoguePlayer();
  let speech: { speakerId: ActorId; message: string } | null = null;
  let snapshot = officeSimulationSnapshot(
    createOfficeSimulation({ reducedMotion }),
  );
  let renderOptions: OfficeSnapshotRenderOptions = {};
  let controlMode: OfficeCameraControlMode = "automatic";
  let paused = false;
  let destroyed = false;
  let hasSnapshot = false;
  let raf: number | undefined;
  let lastTime: number | undefined;
  let frames = 0;
  let frame: SceneFrame = { time: 0, actors: [], speaker: null };
  let uiLayout: readonly OfficeActorUiLayout[] = [];
  const viewport = () => ({
    width: Math.max(1, host.clientWidth),
    height: Math.max(1, host.clientHeight),
  });
  let semantic = renderOfficeSnapshot({
    snapshot,
    viewport: viewport(),
    locale: researchLocale(locale),
    reducedMotion,
    cameraMode: "overview",
  });
  let rendered: OfficeRenderSnapshot = semantic;
  const ui = new MotionUi(host, onActorSelect);
  const camera = new MotionCamera(
    canvas,
    viewport,
    () => paint(0),
    (point) => {
      const world = {
        x: (point.x - rendered.camera.x) / rendered.camera.scale,
        y: (point.y - rendered.camera.y) / rendered.camera.scale,
      };
      const actor = [...frame.actors]
        .sort((a, b) => b.position.y - a.position.y)
        .find(
          (actor) =>
            Math.abs(actor.position.x - world.x) < 28 &&
            world.y > actor.position.y - 95 &&
            world.y < actor.position.y + 10,
        );
      if (actor) onActorSelect?.(actor.id);
    },
  );

  function paint(delta: number): void {
    if (destroyed) return;
    const dialogue = renderOptions.dialogue;
    const sceneOptions = {
      reducedMotion,
      paused,
      ...(dialogue ? { dialogue, speech } : {}),
    };
    frame = scene.update(snapshot, semantic, delta, sceneOptions);
    const playback = dialoguePlayer.update(
      dialogue,
      !paused &&
        !document.hidden &&
        dialogue !== undefined &&
        scene.readyForDialogue(dialogue),
      delta * 1000,
    );
    if (dialogue) {
      const nextSpeech =
        playback.message === null
          ? null
          : { speakerId: dialogue.speakerId, message: playback.message };
      if (
        nextSpeech?.message !== speech?.message ||
        nextSpeech?.speakerId !== speech?.speakerId
      ) {
        speech = nextSpeech;
        frame = scene.update(snapshot, semantic, 0, {
          ...sceneOptions,
          speech,
        });
      }
      ui.setBubbleTypingElapsed(playback.elapsed + 12, reducedMotion);
    }
    const actors = semantic.actors.map((actor) => {
      const physical = frame.actors.find(
        (candidate) => candidate.id === actor.id,
      );
      return physical
        ? {
            ...actor,
            world: physical.position,
            facing: physical.facing,
            bubble: {
              visible: physical.speech !== null,
              message: physical.speech ?? "",
            },
          }
        : actor;
    });
    const target = officeCameraTransform({
      mode:
        controlMode === "overview"
          ? "overview"
          : (renderOptions.cameraMode ?? "overview"),
      snapshotTarget: renderOptions.cameraActorIds?.length
        ? { kind: "actors", actorIds: renderOptions.cameraActorIds }
        : snapshot.cameraTarget,
      actors,
      viewport: viewport(),
    });
    rendered = {
      ...semantic,
      actors,
      camera: camera.update(target, delta, reducedMotion || paused),
    };
    const { width, height } = viewport();
    const density = canvas.width / width;
    ctx.setTransform(density, 0, 0, density, 0, 0);
    ctx.fillStyle = "#182124";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(rendered.camera.x, rendered.camera.y);
    ctx.scale(rendered.camera.scale, rendered.camera.scale);
    drawWorld(ctx, assets, frame, locale);
    ctx.restore();
    uiLayout = ui.draw(
      ctx,
      rendered,
      viewport(),
      showActorUi,
      showActorBubbles,
    );
    host.setAttribute(
      "data-visible-bubble-count",
      String(uiLayout.filter((item) => item.bubble.visible).length),
    );
    host.setAttribute("data-dialogue-id", dialogue?.id ?? "");
    host.setAttribute("data-dialogue-text", playback.message ?? "");
    host.setAttribute(
      "data-dialogue-status",
      playback.message !== null
        ? "speaking"
        : dialogue && dialoguePlayer.isFinished(dialogue.id)
          ? "finished"
          : "waiting",
    );
    const furniture = motionFurniture(frame);
    const seats = furniture.flatMap((item) => item.seats);
    host.setAttribute("data-render-frame-count", String(++frames));
    host.setAttribute("data-render-tick", String(snapshot.tick));
    host.setAttribute("data-render-beat", snapshot.beatId);
    host.setAttribute("data-render-actor-count", String(actors.length));
    host.setAttribute(
      "data-render-visible-actor-count",
      String(uiLayout.filter((item) => item.bodyVisible).length),
    );
    host.setAttribute("data-camera-mode", rendered.camera.mode);
    host.setAttribute("data-seat-count", String(seats.length));
    host.setAttribute(
      "data-occupied-seat-count",
      String(seats.filter((seat) => seat.occupied).length),
    );
    host.setAttribute(
      "data-motion-actions",
      frame.actors.map((actor) => `${actor.id}:${actor.action}`).join(","),
    );
    for (const change of playback.changes) {
      options.onDialogueChange?.(change);
    }
  }

  function animate(now: number): void {
    raf = undefined;
    if (
      destroyed ||
      paused ||
      document.hidden ||
      (reducedMotion &&
        (!renderOptions.dialogue ||
          dialoguePlayer.isFinished(renderOptions.dialogue.id)))
    )
      return;
    const delta =
      lastTime === undefined ? 0 : Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    paint(delta);
    raf = window.requestAnimationFrame(animate);
  }
  function stop(): void {
    if (raf !== undefined) window.cancelAnimationFrame(raf);
    raf = undefined;
    lastTime = undefined;
  }
  function start(): void {
    if (
      !destroyed &&
      hasSnapshot &&
      !paused &&
      (!reducedMotion ||
        (renderOptions.dialogue !== undefined &&
          !dialoguePlayer.isFinished(renderOptions.dialogue.id))) &&
      !document.hidden &&
      raf === undefined
    )
      raf = window.requestAnimationFrame(animate);
  }
  function renderSnapshot(
    next: OfficeSimulationSnapshot,
    nextOptions: OfficeSnapshotRenderOptions = {},
  ): OfficeRenderSnapshot {
    if (next.tick < snapshot.tick) scene.reset();
    snapshot = next;
    hasSnapshot = true;
    renderOptions = nextOptions;
    semantic = renderOfficeSnapshot({
      snapshot,
      ...nextOptions,
      viewport: viewport(),
      locale: researchLocale(locale),
      reducedMotion,
    });
    paint(0);
    start();
    return rendered;
  }
  function resize(): void {
    const { width, height } = viewport();
    const density = officeRendererResolution(window.devicePixelRatio);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    if (hasSnapshot) paint(0);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const visibility = () => {
    if (document.hidden) stop();
    else start();
  };
  document.addEventListener("visibilitychange", visibility);
  host.setAttribute("data-office-renderer", "motion-v1");
  host.setAttribute("data-actor-ui", showActorUi ? "visible" : "hidden");
  host.setAttribute("data-room-plaque-count", "5");
  host.setAttribute("data-room-plaque-locale", locale);
  host.setAttribute("data-office-entity-count", "17");
  resize();

  const controller: OfficeGameController = {
    renderSnapshot,
    setCameraMode(mode) {
      renderSnapshot(snapshot, { ...renderOptions, cameraMode: mode });
    },
    setCameraControlMode(mode) {
      controlMode = mode;
      camera.setMode(mode);
      host.setAttribute("data-camera-control-mode", mode);
    },
    setBubbleTypingElapsed(elapsedMs) {
      ui.setBubbleTypingElapsed(elapsedMs, reducedMotion);
      paint(0);
    },
    inspect() {
      return {
        render: rendered,
        furniture: motionFurniture(frame),
        ui: uiLayout,
      };
    },
    setPaused(value) {
      if (paused === value) return;
      paused = value;
      if (value) stop();
      else start();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      observer.disconnect();
      camera.destroy();
      ui.destroy();
      canvas.remove();
      document.removeEventListener("visibilitychange", visibility);
      signal.removeEventListener("abort", controller.destroy);
      for (const key of [
        "data-office-renderer",
        "data-room-plaque-count",
        "data-room-plaque-locale",
        "data-actor-ui",
        "data-office-entity-count",
      ])
        host.removeAttribute(key);
    },
  };
  signal.addEventListener("abort", controller.destroy, { once: true });
  return controller;
}
