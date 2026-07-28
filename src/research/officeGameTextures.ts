import { Rectangle, Texture } from "pixi.js";
import { ACTOR_ATLAS } from "./officeActorAtlas";
import {
  type AnimationKey,
  agentAnimations,
  type FrameRef,
} from "./officeGameAnimations";

export type TextureClips = Readonly<Record<AnimationKey, readonly Texture[]>>;

function frameTexture(sheet: Texture, frame: FrameRef): Texture {
  return new Texture({
    source: sheet.source,
    frame: new Rectangle(
      frame.column * ACTOR_ATLAS.frame.width,
      frame.row * ACTOR_ATLAS.frame.height,
      ACTOR_ATLAS.frame.width,
      ACTOR_ATLAS.frame.height,
    ),
  });
}

export function buildActorClips(sheet: Texture): TextureClips {
  sheet.source.scaleMode = "linear";
  const textures = (key: AnimationKey): readonly Texture[] =>
    agentAnimations[key].map((frame) => frameTexture(sheet, frame));
  return {
    idle_down: textures("idle_down"),
    idle_left: textures("idle_left"),
    idle_right: textures("idle_right"),
    idle_up: textures("idle_up"),
    sit_down: textures("sit_down"),
    sit_left: textures("sit_left"),
    sit_right: textures("sit_right"),
    sit_up: textures("sit_up"),
    walk_down: textures("walk_down"),
    walk_left: textures("walk_left"),
    walk_right: textures("walk_right"),
    walk_up: textures("walk_up"),
  };
}
