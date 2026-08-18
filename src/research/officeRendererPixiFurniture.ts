import { Assets, Container, Graphics, Sprite, type Texture } from "pixi.js";
import type {
  OfficeFurnitureRenderState,
  OfficeSeatRenderState,
} from "./officeGameFurniture";
import type { OfficeFacing } from "./officeSceneManifest";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import type { AgentId } from "./types";

type SeatRuntime = {
  readonly chairParts: readonly Container[];
  readonly laptop: Container | null;
};

export type OfficeFurnitureRuntime = {
  readonly apply: (states: readonly OfficeFurnitureRenderState[]) => void;
};

export function chairAssetPathForFacing(facing: OfficeFacing): string {
  if (facing !== "up" && facing !== "down") {
    throw new RangeError(`Work chairs only support vertical facing: ${facing}`);
  }
  return `${OFFICE_SCENE_MANIFEST.assets.entitiesRoot}/analyst-chair-${facing}.png`;
}

export function chairVisualForFacing(facing: OfficeFacing): {
  readonly backrestY: number;
  readonly cushionY: number;
  readonly baseY: number;
} {
  if (facing === "up") {
    return Object.freeze({ backrestY: 12, cushionY: -2, baseY: 22 });
  }
  if (facing === "down") {
    return Object.freeze({ backrestY: -22, cushionY: -7, baseY: 15 });
  }
  throw new RangeError(`Work chairs only support vertical facing: ${facing}`);
}

export function chairLayerOrderForFacing(facing: OfficeFacing): {
  readonly chair: number;
  readonly actor: number;
} {
  if (facing !== "up" && facing !== "down") {
    throw new RangeError(`Work chairs only support vertical facing: ${facing}`);
  }
  return Object.freeze({
    // At a south-side seat the analyst faces away from the viewer, so the
    // complete physical chair back belongs in front of the lower torso. A
    // north-side chair remains behind the front-facing analyst.
    chair: facing === "up" ? 300 : -300,
    actor: 0,
  });
}

export function chairRootOffsetYForFacing(facing: OfficeFacing): number {
  if (facing === "up") return -12;
  if (facing === "down") return -16;
  throw new RangeError(`Work chairs only support vertical facing: ${facing}`);
}

export function laptopVisualForFacing(facing: OfficeFacing): {
  readonly screenY: number;
  readonly keyboardY: number;
  readonly rootOffsetY: number;
  readonly rotation: number;
} {
  if (facing === "up") {
    return Object.freeze({
      screenY: -9,
      keyboardY: 8,
      rootOffsetY: -16,
      rotation: 0,
    });
  }
  if (facing === "down") {
    return Object.freeze({
      screenY: 9,
      keyboardY: -8,
      rootOffsetY: 0,
      rotation: 0,
    });
  }
  throw new RangeError(`Work laptops only support vertical facing: ${facing}`);
}

export function furnitureAssetPathFor(
  state: OfficeFurnitureRenderState,
): string | null {
  return state.assetPath;
}

function tableFor(
  state: OfficeFurnitureRenderState,
  texture: Texture | undefined,
): Container {
  const root = new Container();
  const { width, height } = state.size;
  if (state.assetPath !== null) {
    if (!texture)
      throw new RangeError(`No generated furniture texture ${state.assetPath}`);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = width;
    sprite.height = height;
    sprite.roundPixels = true;
    root.addChild(sprite);
    root.position.set(state.position.x, state.position.y);
    root.zIndex = state.zIndex;
    return root;
  }
  const radius =
    state.kind === "round"
      ? Math.min(width, height) / 2
      : state.kind === "oval"
        ? height / 2
        : 18;
  const shadow = new Graphics()
    .roundRect(-width / 2 + 4, -height / 2 + 8, width, height, radius)
    .fill({ color: 0x26313a, alpha: 0.22 });
  const edge = new Graphics()
    .roundRect(-width / 2, -height / 2, width, height, radius)
    .fill({ color: 0xc6cbd0 })
    .stroke({ color: 0x53606b, width: 2, alpha: 0.74 });
  const surface = new Graphics()
    .roundRect(
      -width / 2 + 5,
      -height / 2 + 5,
      width - 10,
      height - 12,
      Math.max(8, radius - 5),
    )
    .fill({ color: state.kind === "strategy" ? 0x34414c : 0xf2f0eb })
    .stroke({ color: state.accent, width: 3, alpha: 0.72 });
  const centerRail = new Graphics()
    .roundRect(-width * 0.18, -4, width * 0.36, 8, 4)
    .fill({ color: state.accent, alpha: 0.34 });
  root.addChild(shadow, edge, surface, centerRail);
  root.position.set(state.position.x, state.position.y);
  root.zIndex = state.zIndex;
  return root;
}

function chairFor(
  seat: OfficeSeatRenderState,
  textures: Readonly<Record<"up" | "down", Texture>>,
): readonly Container[] {
  const rear = new Container();
  const layers = chairLayerOrderForFacing(seat.facing);
  if (seat.facing !== "up" && seat.facing !== "down") {
    throw new RangeError(
      `Work chairs only support vertical facing: ${seat.facing}`,
    );
  }
  const chairTexture = textures[seat.facing];
  const makeChairSprite = (): Sprite => {
    const sprite = new Sprite(chairTexture);
    // V9 entity preparation centers the visible chair, so the seat coordinate
    // can use the texture center for both directions without lateral drift.
    sprite.anchor.set(0.5);
    sprite.width = 64;
    sprite.height = 64;
    sprite.roundPixels = true;
    return sprite;
  };
  rear.addChild(makeChairSprite());
  const actorDepth = Math.round(seat.position.y * 1000);
  const rootOffsetY = chairRootOffsetYForFacing(seat.facing);
  rear.position.set(seat.position.x, seat.position.y + rootOffsetY);
  rear.zIndex = actorDepth + layers.chair;
  return Object.freeze([rear]);
}

function laptopFor(seat: OfficeSeatRenderState): Container {
  const root = new Container();
  const visual = laptopVisualForFacing(seat.facing);
  const screen = new Graphics()
    .roundRect(-18, visual.screenY - 6, 36, 12, 3)
    .fill({ color: 0x17222c })
    .stroke({ color: 0x667582, width: 1 });
  const display = new Graphics()
    .roundRect(-15, visual.screenY - 4, 30, 7, 2)
    .fill({ color: 0x224a65 })
    .rect(-12, visual.screenY - 2, 10, 1.5)
    .fill({ color: 0x61b4c8 })
    .rect(-12, visual.screenY + 1, 18, 1.5)
    .fill({ color: 0xc49c57 });
  const keyboard = new Graphics()
    .roundRect(-17, visual.keyboardY - 5, 34, 10, 2)
    .fill({ color: 0xaeb6bd })
    .stroke({ color: 0x57636c, width: 1 })
    .rect(-12, visual.keyboardY - 2, 24, 1)
    .fill({ color: 0x6c7880, alpha: 0.72 });
  const hinge = new Graphics()
    .roundRect(-15, -1, 30, 2, 1)
    .fill({ color: 0x3c4851 });
  root.addChild(screen, display, keyboard, hinge);
  root.position.set(
    seat.laptopPosition.x,
    seat.laptopPosition.y + visual.rootOffsetY,
  );
  root.rotation = visual.rotation;
  return root;
}

export async function createOfficeFurnitureRuntime(
  world: Container,
  states: readonly OfficeFurnitureRenderState[],
): Promise<OfficeFurnitureRuntime> {
  const assetPaths = [
    ...new Set(
      states.flatMap((state) =>
        state.assetPath === null ? [] : [state.assetPath],
      ),
    ),
  ];
  const [chairUpTexture, chairDownTexture, generatedEntries] =
    await Promise.all([
      Assets.load<Texture>(chairAssetPathForFacing("up")),
      Assets.load<Texture>(chairAssetPathForFacing("down")),
      Promise.all(
        assetPaths.map(async (path) => {
          const texture = await Assets.load<Texture>(path);
          texture.source.scaleMode = "linear";
          return [path, texture] as const;
        }),
      ),
    ]);
  chairUpTexture.source.scaleMode = "linear";
  chairDownTexture.source.scaleMode = "linear";
  const chairTextures = Object.freeze({
    up: chairUpTexture,
    down: chairDownTexture,
  });
  const generatedTextures = new Map(generatedEntries);
  const entries = states.map((state) => {
    const table = tableFor(
      state,
      state.assetPath === null
        ? undefined
        : generatedTextures.get(state.assetPath),
    );
    world.addChild(table);
    const seats = new Map<AgentId, SeatRuntime>();
    for (const seat of state.seats) {
      const chairParts = chairFor(seat, chairTextures);
      const laptop = state.assetPath === null ? laptopFor(seat) : null;
      if (laptop) laptop.zIndex = state.zIndex + 100;
      world.addChild(...chairParts);
      if (laptop) world.addChild(laptop);
      seats.set(seat.actorId, { chairParts, laptop });
    }
    return [state.id, { table, seats }] as const;
  });
  const runtimes = new Map(entries);
  return Object.freeze({
    apply(nextStates: readonly OfficeFurnitureRenderState[]) {
      for (const state of nextStates) {
        const runtime = runtimes.get(state.id);
        if (!runtime) throw new RangeError(`No furniture ${state.id}`);
        for (const seat of state.seats) {
          const seatRuntime = runtime.seats.get(seat.actorId);
          if (!seatRuntime) throw new RangeError(`No seat ${seat.actorId}`);
          for (const part of seatRuntime.chairParts) {
            part.alpha = seat.occupied ? 0.94 : 1;
          }
        }
      }
    },
  });
}
