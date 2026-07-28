import type { Container } from "pixi.js";
import {
  applyAgentRenderState,
  type MutableAgentDisplayRuntime,
} from "./officeGameAgent";
import type { OfficeFurnitureRenderState } from "./officeGameFurniture";
import type {
  OfficeRendererViewport,
  OfficeRenderSnapshot,
} from "./officeRenderer";
import type { OfficeFurnitureRuntime } from "./officeRendererPixiFurniture";
import {
  layoutOfficeUi,
  type OfficeActorUiLayout,
} from "./officeRendererUiLayout";
import type { AgentId } from "./types";

type ApplyOfficeProjectionInput = {
  readonly projection: OfficeRenderSnapshot;
  readonly viewport: OfficeRendererViewport;
  readonly actors: ReadonlyMap<AgentId, MutableAgentDisplayRuntime>;
  readonly furniture: OfficeFurnitureRuntime;
  readonly furnitureStates: readonly OfficeFurnitureRenderState[];
  readonly world: Container;
  readonly host: HTMLDivElement;
  readonly showActorBubbles?: boolean;
};

export function applyOfficeProjection(
  input: ApplyOfficeProjectionInput,
): readonly OfficeActorUiLayout[] {
  const { camera } = input.projection;
  const furnitureObstacles = input.furnitureStates.map((state) => ({
    left: camera.x + (state.position.x - state.size.width / 2) * camera.scale,
    top: camera.y + (state.position.y - state.size.height / 2) * camera.scale,
    right: camera.x + (state.position.x + state.size.width / 2) * camera.scale,
    bottom:
      camera.y + (state.position.y + state.size.height / 2) * camera.scale,
  }));
  const uiLayouts = layoutOfficeUi({
    projection: input.projection,
    viewport: input.viewport,
    obstacles: furnitureObstacles,
  });
  const uiByActor = new Map(
    uiLayouts.map((layout) => [layout.actorId, layout]),
  );
  for (const actor of input.projection.actors) {
    const runtime = input.actors.get(actor.id);
    const uiLayout = uiByActor.get(actor.id);
    if (!runtime || !uiLayout) {
      throw new RangeError(`No actor display/layout for ${actor.id}`);
    }
    applyAgentRenderState(runtime, actor, uiLayout);
    if (input.showActorBubbles === false)
      runtime.bubble.container.visible = false;
  }
  input.furniture.apply(input.furnitureStates);
  input.world.scale.set(input.projection.camera.scale);
  input.world.position.set(
    input.projection.camera.x,
    input.projection.camera.y,
  );
  input.host.setAttribute("data-render-tick", String(input.projection.tick));
  input.host.setAttribute("data-render-beat", input.projection.beatId);
  input.host.setAttribute(
    "data-render-actor-count",
    String(input.projection.actors.length),
  );
  input.host.setAttribute(
    "data-render-visible-actor-count",
    String(
      [...input.actors.values()].filter(
        ({ body, sprite }) =>
          body.visible && body.alpha > 0 && sprite.visible && sprite.alpha > 0,
      ).length,
    ),
  );
  input.host.setAttribute("data-camera-mode", input.projection.camera.mode);
  const seats = input.furnitureStates.flatMap((state) => state.seats);
  input.host.setAttribute("data-seat-count", String(seats.length));
  input.host.setAttribute(
    "data-occupied-seat-count",
    String(seats.filter((seat) => seat.occupied).length),
  );
  input.host.setAttribute(
    "data-office-ui-layout",
    JSON.stringify(
      uiLayouts.map((layout) => ({
        actorId: layout.actorId,
        uiVisible: layout.uiVisible,
        label: {
          visible: layout.label.visible,
          bounds: layout.label.bounds,
        },
        bubble: {
          visible: layout.bubble.visible,
          bounds: layout.bubble.bounds,
        },
      })),
    ),
  );
  return uiLayouts;
}
