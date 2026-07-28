import { actorFrame } from "./officeActorAtlas";
import type { Direction } from "./officeGameConfig";

export type AnimationKey =
  | `idle_${Direction}`
  | `sit_${Direction}`
  | `walk_${Direction}`;

export type FrameRef = {
  readonly row: number;
  readonly column: number;
};

const frames = (
  mode: "idle" | "sit" | "walk",
  direction: Direction,
  count: number,
): readonly FrameRef[] =>
  Array.from({ length: count }, (_, index) => {
    const frame = actorFrame(mode, direction, index);
    return { row: frame.row, column: frame.column };
  });

export const agentAnimations: Readonly<
  Record<AnimationKey, readonly FrameRef[]>
> = {
  idle_down: frames("idle", "down", 1),
  idle_left: frames("idle", "left", 1),
  idle_right: frames("idle", "right", 1),
  idle_up: frames("idle", "up", 1),
  walk_down: frames("walk", "down", 4),
  walk_left: frames("walk", "left", 4),
  walk_right: frames("walk", "right", 4),
  walk_up: frames("walk", "up", 4),
  sit_down: frames("sit", "down", 1),
  sit_left: frames("sit", "left", 1),
  sit_right: frames("sit", "right", 1),
  sit_up: frames("sit", "up", 1),
};

export function animationKey(
  mode: "idle" | "sit" | "walk",
  direction: Direction,
): AnimationKey {
  return `${mode}_${direction}`;
}

export function frameFitsSheet(frame: FrameRef): boolean {
  return (
    Number.isInteger(frame.row) &&
    Number.isInteger(frame.column) &&
    frame.row >= 0 &&
    frame.row < 4 &&
    frame.column >= 0 &&
    frame.column < 4
  );
}
