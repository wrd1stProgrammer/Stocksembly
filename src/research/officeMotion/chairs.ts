import { ellipse, line, panel } from "./canvasPrimitives";
import type { Facing, Point } from "./types";

export type ChairSeat = Point & { readonly facing: Facing };

function upholstery(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const fabric = ctx.createLinearGradient(0, y, 0, y + height);
  fabric.addColorStop(0, "#43505e");
  fabric.addColorStop(1, "#293443");
  panel(ctx, x - 1, y - 1, width + 2, height + 2, 5, "#172331", "#78838a");
  ctx.fillStyle = fabric;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 4);
  ctx.fill();
  line(
    ctx,
    [
      [x + 4, y + 4],
      [x + width - 4, y + 4],
    ],
    "#75818b70",
    0.8,
  );
}

function backrest(ctx: CanvasRenderingContext2D, facing: Facing): void {
  if (facing === "left" || facing === "right") {
    const backX = facing === "right" ? -15 : 9;
    line(
      ctx,
      [
        [backX + 3, -16],
        [backX + 1, -35],
      ],
      "#161f28",
      3,
    );
    upholstery(ctx, backX, -43, 6, 27);
  } else {
    line(
      ctx,
      [
        [0, -12],
        [0, -29],
      ],
      "#18212b",
      4,
    );
    upholstery(ctx, -15, facing === "up" ? -35 : -49, 30, 26);
    if (facing === "up") {
      panel(ctx, -10, -14, 20, 2, 1, "#566574");
    }
  }
}

export function drawChairBase(
  ctx: CanvasRenderingContext2D,
  seat: ChairSeat,
): void {
  ctx.save();
  ctx.translate(seat.x, seat.y);
  ellipse(ctx, 0, 8, 23, 6, "#19222a20");
  line(
    ctx,
    [
      [0, -10],
      [0, 7],
    ],
    "#66747b",
    4,
  );
  for (const [x, y] of [
    [-18, 11],
    [18, 11],
    [-14, 0],
    [14, 0],
    [0, 15],
  ] as const) {
    line(
      ctx,
      [
        [0, 5],
        [x, y],
      ],
      "#26313d",
      3,
    );
    line(
      ctx,
      [
        [0, 4],
        [x, y - 1],
      ],
      "#8b9496",
      1,
    );
    panel(ctx, x - 3, y, 6, 3.5, 1.5, "#1b2630");
  }
  if (seat.facing !== "up") backrest(ctx, seat.facing);
  ellipse(ctx, 0, -13, 17, 8, "#18232e");
  ellipse(ctx, 0, -16, 16, 7, "#414f60");
  line(
    ctx,
    [
      [-12, -13],
      [12, -13],
    ],
    "#63717e",
    1,
  );
  ctx.restore();
}

export function drawChairFront(
  ctx: CanvasRenderingContext2D,
  seat: ChairSeat,
): void {
  ctx.save();
  ctx.translate(seat.x, seat.y);
  if (seat.facing === "up") backrest(ctx, seat.facing);
  const side = seat.facing === "left" || seat.facing === "right";
  const supports = side ? [seat.facing === "right" ? -5 : 5] : [-19, 19];
  for (const x of supports) {
    line(
      ctx,
      [
        [x, -12],
        [x, -22],
      ],
      "#28343f",
      2,
    );
    panel(
      ctx,
      x - (side ? 9 : 3),
      -25,
      side ? 18 : 6,
      4,
      2,
      "#273543",
      "#73818a",
    );
  }
  ctx.restore();
}
