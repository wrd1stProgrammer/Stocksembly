import {
  ACTOR_ATLAS,
  actorDisplayScale,
  actorVisualTopInset,
} from "./officeActorAtlas";
import { bubbleDimensions } from "./officeGameBubble";
import type {
  OfficeRenderActor,
  OfficeRendererViewport,
  OfficeRenderSnapshot,
} from "./officeRenderer";
import type { OfficeManifestAgentId } from "./officeSceneManifest";

export type OfficeScreenRect = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

export type OfficeActorUiLayout = {
  readonly actorId: OfficeManifestAgentId;
  readonly bodyVisible: boolean;
  readonly bodyBounds: OfficeScreenRect;
  readonly uiVisible: boolean;
  readonly screenPosition: { readonly x: number; readonly y: number };
  readonly label: {
    readonly visible: boolean;
    readonly x: number;
    readonly y: number;
    readonly screenFontSize: number;
    readonly bounds: OfficeScreenRect;
  };
  readonly bubble: {
    readonly visible: boolean;
    readonly x: number;
    readonly y: number;
    readonly screenFontSize: number;
    readonly scale: number;
    readonly bounds: OfficeScreenRect;
  };
};

export type OfficeUiLayoutInput = {
  readonly projection: OfficeRenderSnapshot;
  readonly viewport: OfficeRendererViewport;
  readonly obstacles?: readonly OfficeScreenRect[];
  readonly actorDisplayScale?: number;
};

const EDGE_INSET = 4;
const ELEMENT_GAP = 1;
const LABEL_FONT_SIZE = 14;
const LABEL_HEIGHT = 18;
const BUBBLE_FONT_SIZE = 10.5;
const MOBILE_VIEWPORT_MAX_WIDTH = 767;

type ActorScreenContext = {
  readonly actor: OfficeRenderActor;
  readonly x: number;
  readonly y: number;
  readonly bodyBounds: OfficeScreenRect;
  readonly bodyVisible: boolean;
  readonly uiVisible: boolean;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function contained(
  rect: OfficeScreenRect,
  viewport: OfficeRendererViewport,
): boolean {
  return (
    rect.left >= 0 &&
    rect.top >= 0 &&
    rect.right <= viewport.width &&
    rect.bottom <= viewport.height
  );
}

function overlaps(first: OfficeScreenRect, second: OfficeScreenRect): boolean {
  return !(
    first.right + ELEMENT_GAP <= second.left ||
    first.left >= second.right + ELEMENT_GAP ||
    first.bottom + ELEMENT_GAP <= second.top ||
    first.top >= second.bottom + ELEMENT_GAP
  );
}

function screenRect(
  centerX: number,
  top: number,
  width: number,
  height: number,
  viewport: OfficeRendererViewport,
): OfficeScreenRect {
  const left = clamp(
    centerX - width / 2,
    EDGE_INSET,
    viewport.width - width - EDGE_INSET,
  );
  const safeTop = clamp(top, EDGE_INSET, viewport.height - height - EDGE_INSET);
  return Object.freeze({
    left,
    top: safeTop,
    right: left + width,
    bottom: safeTop + height,
  });
}

function bubbleCandidates(
  context: ActorScreenContext,
  width: number,
  height: number,
  viewport: OfficeRendererViewport,
): readonly OfficeScreenRect[] {
  const maximumHorizontalTether = Math.min(40, width * 0.2);
  return Object.freeze(
    [0, -0.16, 0.16]
      .map((horizontalOffset) =>
        screenRect(
          context.x + width * horizontalOffset,
          context.bodyBounds.top - ELEMENT_GAP - height,
          width,
          height,
          viewport,
        ),
      )
      .filter((candidate) => {
        const centerX = (candidate.left + candidate.right) / 2;
        return (
          candidate.bottom + ELEMENT_GAP <= context.bodyBounds.top &&
          Math.abs(centerX - context.x) <= maximumHorizontalTether
        );
      }),
  );
}

function labelCandidates(
  context: ActorScreenContext,
  width: number,
  height: number,
  viewport: OfficeRendererViewport,
): readonly OfficeScreenRect[] {
  return Object.freeze(
    [0, -0.32, 0.32].map((offset) =>
      screenRect(
        context.x + offset * width,
        context.bodyBounds.bottom + ELEMENT_GAP,
        width,
        height,
        viewport,
      ),
    ),
  );
}

function firstFree(
  candidates: readonly OfficeScreenRect[],
  occupied: readonly OfficeScreenRect[],
): OfficeScreenRect | undefined {
  return candidates.find((candidate) =>
    occupied.every((bounds) => !overlaps(candidate, bounds)),
  );
}

function estimatedLabelWidth(label: string): number {
  const glyphWidth = [...label].reduce(
    (width, glyph) => width + ((glyph.codePointAt(0) ?? 0) > 0xff ? 14 : 8),
    8,
  );
  return clamp(glyphWidth, 30, 112);
}

function bubbleScreenScale(
  projection: OfficeRenderSnapshot,
  viewport: OfficeRendererViewport,
): number {
  if (viewport.width > MOBILE_VIEWPORT_MAX_WIDTH) return 1;
  return clamp(
    1.08 + Math.max(0, projection.camera.scale - 1) * 0.12,
    1.08,
    1.16,
  );
}

function contextFor(
  actor: OfficeRenderActor,
  projection: OfficeRenderSnapshot,
  viewport: OfficeRendererViewport,
  displayScale: number | undefined,
): ActorScreenContext {
  const { camera } = projection;
  const x = camera.x + actor.world.x * camera.scale;
  const y = camera.y + actor.world.y * camera.scale;
  const spriteScale =
    (displayScale ?? actorDisplayScale(actor.animation)) * camera.scale;
  const bodyBounds = Object.freeze({
    left: x - ACTOR_ATLAS.footPivot.x * spriteScale,
    top:
      y +
      ((displayScale === undefined ? actorVisualTopInset(actor.animation) : 0) -
        ACTOR_ATLAS.footPivot.y) *
        spriteScale,
    right:
      x + (ACTOR_ATLAS.frame.width - ACTOR_ATLAS.footPivot.x) * spriteScale,
    bottom:
      y + (ACTOR_ATLAS.frame.height - ACTOR_ATLAS.footPivot.y) * spriteScale,
  });
  return Object.freeze({
    actor,
    x,
    y,
    bodyBounds,
    bodyVisible: actor.active || contained(bodyBounds, viewport),
    uiVisible:
      actor.active &&
      x >= 0 &&
      x <= viewport.width &&
      y >= 0 &&
      y <= viewport.height,
  });
}

export function layoutOfficeUi(
  input: OfficeUiLayoutInput,
): readonly OfficeActorUiLayout[] {
  const contexts = input.projection.actors.map((actor) =>
    contextFor(
      actor,
      input.projection,
      input.viewport,
      input.actorDisplayScale,
    ),
  );
  const bubbleScale = bubbleScreenScale(input.projection, input.viewport);
  // Dialogue is the primary research signal. Place active speech first, then
  // let name tags move sideways around it; otherwise a dense forum can hide
  // the current speaker behind labels that carry less information.
  const bubbles = new Map<OfficeManifestAgentId, OfficeScreenRect>();
  const occupiedBubbles: OfficeScreenRect[] = [];
  for (const context of contexts) {
    if (!context.uiVisible || !context.actor.bubble.visible) continue;
    const dimensions = bubbleDimensions(context.actor.bubble.message);
    const bounds = firstFree(
      bubbleCandidates(
        context,
        dimensions.width * bubbleScale,
        dimensions.height * bubbleScale,
        input.viewport,
      ),
      [
        ...occupiedBubbles,
        ...contexts
          .filter(
            (other) => other.actor.id !== context.actor.id && other.bodyVisible,
          )
          .map((other) => other.bodyBounds),
      ],
    );
    if (!bounds) continue;
    bubbles.set(context.actor.id, bounds);
    occupiedBubbles.push(bounds);
  }

  const labels = new Map<OfficeManifestAgentId, OfficeScreenRect>();
  const occupiedLabels: OfficeScreenRect[] = [];
  for (const context of contexts) {
    if (!context.uiVisible) continue;
    const bounds = firstFree(
      labelCandidates(
        context,
        estimatedLabelWidth(context.actor.label),
        LABEL_HEIGHT,
        input.viewport,
      ),
      [...occupiedLabels, ...occupiedBubbles],
    );
    if (!bounds) continue;
    labels.set(context.actor.id, bounds);
    occupiedLabels.push(bounds);
  }

  return Object.freeze(
    contexts.map((context) => {
      const labelBounds = labels.get(context.actor.id);
      const bubbleBounds = bubbles.get(context.actor.id);
      const emptyBounds = Object.freeze({
        left: context.x,
        top: context.y,
        right: context.x,
        bottom: context.y,
      });
      return Object.freeze({
        actorId: context.actor.id,
        bodyVisible: context.bodyVisible,
        bodyBounds: context.bodyBounds,
        uiVisible: context.uiVisible,
        screenPosition: Object.freeze({ x: context.x, y: context.y }),
        label: Object.freeze({
          visible: labelBounds !== undefined,
          x: labelBounds
            ? (labelBounds.left + labelBounds.right) / 2 - context.x
            : 0,
          y: labelBounds ? labelBounds.top - context.y : 0,
          screenFontSize: LABEL_FONT_SIZE,
          bounds: labelBounds ?? emptyBounds,
        }),
        bubble: Object.freeze({
          visible: bubbleBounds !== undefined,
          x: bubbleBounds
            ? (bubbleBounds.left + bubbleBounds.right) / 2 - context.x
            : 0,
          y: bubbleBounds ? bubbleBounds.bottom - context.y : 0,
          screenFontSize: BUBBLE_FONT_SIZE * bubbleScale,
          scale: bubbleScale,
          bounds: bubbleBounds ?? emptyBounds,
        }),
      });
    }),
  );
}
