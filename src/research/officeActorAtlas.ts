import type { Direction } from "./officeGameConfig";

export type ActorAnimationMode = "idle" | "sit" | "walk";

export type ActorFrame = {
  readonly row: number;
  readonly column: number;
  readonly pivot: { readonly x: number; readonly y: number };
};

export const ACTOR_ATLAS = {
  frame: { width: 160, height: 192 },
  columns: 4,
  rows: 4,
  footPivot: { x: 80, y: 178 },
  displayScale: 0.46,
  safeInset: 10,
} as const;

const walkRows: Readonly<Record<Direction, number>> = {
  down: 0,
  left: 2,
  right: 1,
  up: 3,
};

// The sprite sheet contains dedicated left and right profile rows.  Their
// authored stride already travels toward the named direction; reversing the
// left row makes the lead foot move backward and reads as a moonwalk.
const walkColumns: Readonly<Record<Direction, readonly number[]>> = {
  down: Object.freeze([0, 1, 2, 1]),
  left: Object.freeze([0, 1, 2, 1]),
  right: Object.freeze([0, 1, 2, 1]),
  up: Object.freeze([0, 1, 2, 1]),
};

const seatedFrames: Readonly<
  Record<Direction, Pick<ActorFrame, "row" | "column">>
> = {
  down: { row: 0, column: 3 },
  left: { row: 2, column: 3 },
  right: { row: 1, column: 3 },
  up: { row: 3, column: 3 },
};

export function actorFrame(
  mode: ActorAnimationMode,
  direction: Direction,
  frameIndex: number,
): ActorFrame {
  const reference =
    mode === "sit"
      ? seatedFrames[direction]
      : {
          row: walkRows[direction],
          column:
            mode === "idle" ? 0 : (walkColumns[direction][frameIndex % 4] ?? 0),
        };
  return {
    ...reference,
    pivot: ACTOR_ATLAS.footPivot,
  };
}

export function actorWalkColumns(direction: Direction): readonly number[] {
  return walkColumns[direction];
}

export function validateActorAtlas(): string[] {
  const errors: string[] = [];
  for (const mode of ["idle", "walk", "sit"] as const) {
    for (const direction of ["down", "left", "right", "up"] as const) {
      const frame = actorFrame(mode, direction, 0);
      if (frame.row < 0 || frame.row >= ACTOR_ATLAS.rows) {
        errors.push(`${mode}:${direction} row is outside the atlas`);
      }
      if (frame.column < 0 || frame.column >= ACTOR_ATLAS.columns) {
        errors.push(`${mode}:${direction} column is outside the atlas`);
      }
      if (
        frame.pivot.x < ACTOR_ATLAS.safeInset ||
        frame.pivot.x > ACTOR_ATLAS.frame.width - ACTOR_ATLAS.safeInset ||
        frame.pivot.y < ACTOR_ATLAS.safeInset ||
        frame.pivot.y > ACTOR_ATLAS.frame.height - ACTOR_ATLAS.safeInset
      ) {
        errors.push(`${mode}:${direction} pivot is outside the safe area`);
      }
    }
  }
  return errors;
}
