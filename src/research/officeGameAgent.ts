import {
  AnimatedSprite,
  Assets,
  Container,
  Graphics,
  Text,
  type Texture,
} from "pixi.js";
import type { Locale } from "../lib/i18n";
import { ACTOR_ATLAS, actorDisplayScale } from "./officeActorAtlas";
import { officeAgentAssetPath } from "./officeAgentAssets";
import { type AnimationKey, animationKey } from "./officeGameAnimations";
import {
  bubbleDimensions,
  createProgressBubble,
  type ProgressBubble,
  updateProgressBubble,
} from "./officeGameBubble";
import { buildActorClips, type TextureClips } from "./officeGameTextures";
import type { OfficeRenderActor } from "./officeRenderer";
import type { OfficeActorUiLayout } from "./officeRendererUiLayout";
import type { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

// Match the two-step authored gait to the 100ms cell traversal. The neutral
// contact frame between opposite strides keeps the cadence readable.
const WALK_ANIMATION_SPEED = 0.15;

export type MutableAgentDisplayRuntime = {
  readonly id: OfficeRenderActor["id"];
  readonly body: Container;
  readonly ui: Container;
  readonly sprite: AnimatedSprite;
  readonly clips: TextureClips;
  readonly bubble: ProgressBubble;
  readonly label: Container;
  currentAnimation: AnimationKey;
};

function makeActorGroundShadow(): Graphics {
  return new Graphics()
    .ellipse(
      0,
      -1,
      ACTOR_ATLAS.readability.shadowRadiusX,
      ACTOR_ATLAS.readability.shadowRadiusY,
    )
    .fill({ color: 0x081018, alpha: ACTOR_ATLAS.readability.shadowAlpha });
}

function makeLabel(text: string): Container {
  const root = new Container();
  const label = new Text({
    text,
    style: {
      fill: 0xf2f3f5,
      fontFamily: "Pretendard, sans-serif",
      fontSize: 12,
      fontWeight: "700",
      stroke: { color: 0x08090b, width: 1 },
    },
  });
  const width = Math.ceil(label.width) + 10;
  const height = 18;
  const plate = new Graphics()
    .roundRect(-width / 2, 0, width, height, 2)
    .fill({ color: 0x24282e, alpha: 0.97 })
    .stroke({ color: 0x8b929a, width: 1, alpha: 0.9 });
  label.anchor.set(0.5);
  label.position.set(0, height / 2);
  root.addChild(plate, label);
  return root;
}

function playAnimation(
  runtime: MutableAgentDisplayRuntime,
  state: OfficeRenderActor,
): void {
  const key = animationKey(state.animation, state.facing);
  runtime.sprite.scale.set(actorDisplayScale(state.animation));
  if (runtime.currentAnimation === key) return;
  runtime.currentAnimation = key;
  runtime.sprite.textures = [...runtime.clips[key]];
  if (state.animation === "walk") {
    runtime.sprite.animationSpeed = WALK_ANIMATION_SPEED;
    runtime.sprite.gotoAndPlay(0);
    return;
  }
  runtime.sprite.gotoAndStop(0);
}

export async function createAgentRuntime(
  member: (typeof OFFICE_SCENE_MANIFEST.roster)[number],
  locale: Locale,
): Promise<MutableAgentDisplayRuntime> {
  const sheet = await Assets.load<Texture>(officeAgentAssetPath(member.id));
  const clips = buildActorClips(sheet);
  const initialAnimation: AnimationKey = `idle_${member.workSeat.facing}`;
  const sprite = new AnimatedSprite([...clips[initialAnimation]]);
  sprite.anchor.set(
    ACTOR_ATLAS.footPivot.x / ACTOR_ATLAS.frame.width,
    ACTOR_ATLAS.footPivot.y / ACTOR_ATLAS.frame.height,
  );
  sprite.scale.set(actorDisplayScale("idle"));
  sprite.roundPixels = true;
  const body = new Container();
  const shadow = makeActorGroundShadow();
  body.addChild(shadow, sprite);
  const ui = new Container();
  const label = makeLabel(member.name[locale]);
  const bubble = createProgressBubble();
  bubble.container.position.y = -ACTOR_ATLAS.footPivot.y + 18;
  ui.addChild(label, bubble.container);
  return {
    id: member.id,
    body,
    ui,
    sprite,
    clips,
    bubble,
    label,
    currentAnimation: initialAnimation,
  };
}

export function applyAgentRenderState(
  runtime: MutableAgentDisplayRuntime,
  state: OfficeRenderActor,
  uiLayout: OfficeActorUiLayout,
): void {
  playAnimation(runtime, state);
  runtime.body.position.set(
    Math.round(state.world.x),
    Math.round(state.world.y),
  );
  runtime.body.zIndex = state.zIndex;
  runtime.body.visible = uiLayout.bodyVisible;
  runtime.ui.position.set(uiLayout.screenPosition.x, uiLayout.screenPosition.y);
  runtime.ui.scale.set(1);
  runtime.ui.zIndex = state.zIndex + 50_000_000;
  runtime.ui.visible = uiLayout.uiVisible;
  runtime.label.position.set(uiLayout.label.x, uiLayout.label.y);
  runtime.label.visible = uiLayout.label.visible;
  runtime.bubble.container.position.set(uiLayout.bubble.x, uiLayout.bubble.y);
  runtime.bubble.container.scale.set(uiLayout.bubble.scale);
  const bubbleSize = bubbleDimensions(state.bubble.message);
  const tailTargetX = -uiLayout.bubble.x / uiLayout.bubble.scale;
  runtime.bubble.tail.position.x = Math.max(
    -bubbleSize.width / 2 + 14,
    Math.min(bubbleSize.width / 2 - 14, tailTargetX),
  );
  runtime.bubble.container.visible = uiLayout.bubble.visible;
  updateProgressBubble(runtime.bubble, state.bubble.message);
}
